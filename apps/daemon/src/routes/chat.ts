import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import { projectKindToTracking } from '@open-design/contracts/analytics';
import { proxyDispatcherRequestInit, validateUserProviderBaseUrl } from '../connectionTest.js';
import { isKnownReasoningEffort, resolveModelForServiceTier } from '../runtimes/models.js';
import { createRoleMarkerGuard } from '../role-marker-guard.js';
import { authorizeReasoningEgress, sendReasoningEgressDenial } from '../reasoning-egress.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';
import {
  clearInfernoApiKey,
  infernoKeyTail,
  readInfernoApiKey,
  saveInfernoApiKey,
} from '../inferno/credentials.js';
import { INFERNO_ERROR_CODES } from '../inferno/errors.js';
import { InfernoError, fetchInfernoModels, type InfernoModel } from '../inferno/models.js';
import {
  infernoErrorHttpStatus,
  openInfernoUpstream,
  resetInfernoProxyState,
} from '../inferno/proxy.js';

// Allowlist for the `/feedback` route. Mirrors the
// ChatMessageFeedbackReasonCode union in packages/contracts/src/api/chat.ts.
// Kept inline (not imported as a runtime value, since the contract type is
// type-only) so a stale client can't poison Langfuse with unknown categories.
const FEEDBACK_REASON_ALLOWLIST: ReadonlySet<string> = new Set([
  'matched_request',
  'strong_visual',
  'useful_structure',
  'easy_to_continue',
  'followed_design_system',
  'missed_request',
  'weak_visual',
  'could_not_run',
  'too_slow',
  'incomplete_output',
  'hard_to_use',
  'missed_design_system',
  'other',
]);

export interface RegisterChatRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'chat' | 'agents' | 'critique' | 'validation' | 'lifecycle' | 'paths' | 'telemetry' | 'appConfig'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerChatRoutes(app: Express, ctx: RegisterChatRoutesDeps) {
  const { db, design } = ctx;
  const { sendApiError, createSseResponse } = ctx.http;
  const { readAppConfig } = ctx.appConfig;
  const { testProviderConnection, testAgentConnection, getAgentDef, isKnownModel, isKnownServiceTier, sanitizeCustomModel, listProviderModels } = ctx.agents;
  const {
    handleCritiqueArtifact,
    handleCritiqueInterrupt,
    critiqueArtifactsRoot,
    critiqueResponseCapBytes,
    critiqueRunRegistry,
  } = ctx.critique;
  const rejectProxyPluginContext = (body: Record<string, unknown>, res: any) => {
    if (
      (typeof body.pluginId === 'string' && body.pluginId.trim().length > 0) ||
      (
        typeof body.appliedPluginSnapshotId === 'string' &&
        body.appliedPluginSnapshotId.trim().length > 0
      )
    ) {
      sendApiError(
        res,
        409,
        'PLUGIN_REQUIRES_DAEMON',
        'Plugin runs must go through POST /api/runs so the daemon can resolve and pin the applied plugin snapshot.',
      );
      return true;
    }
    return false;
  };

  // Run lifecycle routes live in `routes/runs.ts`; this file owns feedback,
  // connection tests, critique handoff, and provider proxy routes.

  // Receives the user's thumbs-up/down (+ reason codes) for an assistant
  // turn and forwards it to Langfuse as a `score-create`. Web persists the
  // feedback itself via PUT /messages/:id; this endpoint exists only as a
  // telemetry side channel — the daemon is the single network egress for
  // Langfuse and gates on `telemetry.metrics + telemetry.content` consent.
  //
  // The consent + sink decision is fast (awaits a small file read, no
  // network); we await it so the response status honestly reflects whether
  // the score was enqueued, skipped for consent, or skipped because no
  // Langfuse sink is configured. The actual Langfuse network call happens
  // as a detached promise inside the bridge.
  app.post('/api/runs/:id/feedback', async (req, res) => {
    const runId = req.params.id;
    const body = (req.body ?? {}) as Partial<{
      rating: 'positive' | 'negative';
      reasonCodes: string[];
      hasCustomReason: boolean;
      customReason: string;
    }> & Record<string, unknown>;
    if (!runId) {
      return sendApiError(res, 400, 'INVALID_RUN_ID', 'runId missing');
    }
    const callerOwnedContextFields = [
      'projectId',
      'conversationId',
      'assistantMessageId',
    ].filter((field) => Object.prototype.hasOwnProperty.call(body, field));
    if (callerOwnedContextFields.length > 0) {
      return sendApiError(
        res,
        400,
        'INVALID_FEEDBACK_CONTEXT',
        'feedback project, conversation, and message identity are derived from the run',
      );
    }
    if (body.rating !== 'positive' && body.rating !== 'negative') {
      return sendApiError(res, 400, 'INVALID_RATING', 'rating must be positive or negative');
    }
    const run = design.runs.get(runId);
    if (!run || typeof run.projectId !== 'string' || !run.projectId) {
      return sendApiError(res, 404, 'NOT_FOUND', 'run not found');
    }
    if (!await ctx.authorizeProjectRequest(
      req,
      res,
      run.projectId,
      { mode: 'write', capability: 'writeFiles' },
    )) return;
    // Drop anything outside the contract-side reason allowlist and
    // deduplicate; otherwise a malformed or replayed client payload could
    // create unknown Langfuse categories or duplicate score ids in the
    // same batch.
    const reasonCodes = Array.isArray(body.reasonCodes)
      ? Array.from(
          new Set(
            body.reasonCodes.filter(
              (c): c is string =>
                typeof c === 'string' && FEEDBACK_REASON_ALLOWLIST.has(c),
            ),
          ),
        )
      : [];
    const customReason = typeof body.customReason === 'string' ? body.customReason : '';
    const reportFeedback = ctx.telemetry?.reportFeedback;
    if (!reportFeedback) {
      res.status(202).json({ status: 'skipped_no_sink' });
      return;
    }
    // Build score metadata bag that lands in the Langfuse score body.
    // Mirrors the PostHog event so analysts can cross-reference. Every
    // identity field comes from the daemon-owned run object; request bodies
    // cannot retarget a score to another project/conversation/message.
    const scoreMetadata: Record<string, unknown> = {
      projectId: run.projectId,
      conversationId: run.conversationId ?? null,
      assistantMessageId: run.assistantMessageId ?? null,
      hasCustomReason: body.hasCustomReason === true,
      customReason,
    };
    const outcome = await reportFeedback({
      runId,
      rating: body.rating,
      reasonCodes,
      hasCustomReason: body.hasCustomReason === true,
      customReason,
      scoreMetadata,
    });
    res.status(202).json(outcome);
  });

  // ---- Connection tests (single-shot JSON; no SSE) ------------------------
  // Settings dialog uses these to verify a config works without sending a
  // real chat. Always return HTTP 200 with `ok: false` on upstream-caused
  // failures so the web layer can render a categorized inline status without
  // unwrapping nested error envelopes; real 4xx/5xx here mean a malformed
  // request or daemon bug.
  app.post('/api/provider/models', async (req, res) => {
    const controller = new AbortController();
    const abortIfRequestAborted = () => {
      if ((req.aborted || !req.complete) && !res.writableEnded) {
        controller.abort();
      }
    };
    const abortIfResponseClosed = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on('close', abortIfRequestAborted);
    res.on('close', abortIfResponseClosed);
    const body = req.body || {};
    const protocol = body.protocol;
    if (
      typeof protocol !== 'string' ||
      !['anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix', 'bedrock'].includes(protocol)
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'protocol must be one of anthropic|openai|azure|google|ollama|senseaudio|aihubmix|bedrock',
      );
    }
    // AIHubMix's catalogue (GET /api/v1/models?type=llm) is public, so its
    // model list loads without a key. Every other protocol needs the key to
    // hit its /v1/models endpoint.
    const apiKeyRequired = protocol !== 'aihubmix' && protocol !== 'bedrock';
    if (
      typeof body.baseUrl !== 'string' ||
      typeof body.apiKey !== 'string' ||
      !body.baseUrl.trim() ||
      (apiKeyRequired && !body.apiKey.trim())
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        apiKeyRequired ? 'baseUrl and apiKey are required' : 'baseUrl is required',
      );
    }
    const reasoningDenial = authorizeReasoningEgress({
      policy: body.reasoningExecution,
      routeKind: 'provider_models',
      provider: protocol,
      resolvedBaseUrl: body.baseUrl,
    });
    if (reasoningDenial) return sendReasoningEgressDenial(res, reasoningDenial);
    try {
      const proxyDispatcher = proxyDispatcherRequestInit();
      try {
        const result = await listProviderModels({
          protocol,
          baseUrl: body.baseUrl,
          apiKey: body.apiKey,
          apiVersion:
            typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
          signal: controller.signal,
          requestInit: proxyDispatcher.requestInit,
        });
        return res.json(result);
      } finally {
        await proxyDispatcher.close();
      }
    } catch (err: any) {
      console.warn(
        `[provider:models] uncaught: ${err instanceof Error ? err.message : String(err)}`,
      );
      return sendApiError(res, 500, 'INTERNAL', 'Provider model discovery failed');
    } finally {
      req.off('close', abortIfRequestAborted);
      res.off('close', abortIfResponseClosed);
    }
  });

  app.post('/api/test/connection', async (req, res) => {
    const controller = new AbortController();
    const abortIfRequestAborted = () => {
      if ((req.aborted || !req.complete) && !res.writableEnded) {
        controller.abort();
      }
    };
    const abortIfResponseClosed = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on('close', abortIfRequestAborted);
    res.on('close', abortIfResponseClosed);
    const body = req.body || {};
    try {
      if (body.mode === 'provider') {
        const protocol = body.protocol;
        if (
          typeof protocol !== 'string' ||
          !['anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix', 'bedrock'].includes(protocol)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'protocol must be one of anthropic|openai|azure|google|ollama|senseaudio|aihubmix|bedrock',
          );
        }
        const apiKeyRequired = protocol !== 'bedrock';
        if (
          typeof body.baseUrl !== 'string' ||
          typeof body.apiKey !== 'string' ||
          typeof body.model !== 'string' ||
          !body.baseUrl.trim() ||
          (apiKeyRequired && !body.apiKey.trim()) ||
          !body.model.trim()
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            apiKeyRequired
              ? 'baseUrl, apiKey, and model are required'
              : 'baseUrl and model are required',
          );
        }
        const reasoningDenial = authorizeReasoningEgress({
          policy: body.reasoningExecution,
          routeKind: 'connection_test',
          provider: protocol,
          resolvedBaseUrl: body.baseUrl,
          model: body.model,
        });
        if (reasoningDenial) return sendReasoningEgressDenial(res, reasoningDenial);
        try {
          const result = await testProviderConnection({
            protocol,
            baseUrl: body.baseUrl,
            apiKey: body.apiKey,
            model: body.model,
            apiVersion:
              typeof body.apiVersion === 'string' ? body.apiVersion : undefined,
            signal: controller.signal,
          });
          return res.json(result);
        } catch (err: any) {
          console.warn(
            `[test:provider] uncaught: ${err instanceof Error ? err.message : String(err)}`,
          );
          return sendApiError(res, 500, 'INTERNAL', 'Connection test failed');
        }
      }

      if (body.mode === 'agent') {
        if (typeof body.agentId !== 'string' || !body.agentId.trim()) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'agentId is required');
        }
        try {
          const def = getAgentDef(body.agentId);
          const testStart = Date.now();
          const appConfig = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR).catch(() => ({}));
          const configuredModel =
            def && typeof appConfig.agentModels?.[def.id]?.model === 'string'
              ? appConfig.agentModels[def.id].model
              : undefined;
          const requestedModel =
            typeof body.model === 'string' ? body.model : configuredModel;
          let safeModel =
            def && typeof requestedModel === 'string'
              ? isKnownModel(def, requestedModel)
                ? requestedModel
                : sanitizeCustomModel(requestedModel)
              : undefined;
          if (def && typeof body.model === 'string' && body.model.trim() && !safeModel) {
            return res.json({
              ok: false,
              kind: 'invalid_model_id',
              latencyMs: Date.now() - testStart,
              model: body.model.trim(),
              agentName: def.name,
              detail: 'Invalid custom model id. Use a model id that starts with a letter or number and contains no spaces.',
            });
          }
          const safeReasoning =
            def &&
            typeof body.reasoning === 'string' &&
            isKnownReasoningEffort(def, safeModel, body.reasoning)
              ? body.reasoning
              : undefined;
          safeModel = def
            ? resolveModelForServiceTier(
                def,
                safeModel,
                typeof body.serviceTier === 'string' ? body.serviceTier : null,
              ) ?? undefined
            : safeModel;
          const safeServiceTier =
            def &&
            typeof body.serviceTier === 'string' &&
            isKnownServiceTier(def, safeModel, body.serviceTier)
              ? body.serviceTier
              : undefined;
          const result = await testAgentConnection({
            agentId: body.agentId,
            model: safeModel ?? undefined,
            reasoning: safeReasoning,
            serviceTier: safeServiceTier,
            agentCliEnv:
              body.agentCliEnv && typeof body.agentCliEnv === 'object'
                ? body.agentCliEnv
                : undefined,
            signal: controller.signal,
          });
          return res.json(result);
        } catch (err: any) {
          console.warn(
            `[test:agent] uncaught: ${err instanceof Error ? err.message : String(err)}`,
          );
          return sendApiError(res, 500, 'INTERNAL', 'Agent test failed');
        }
      }

      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'mode must be one of provider|agent',
      );
    } finally {
      req.off('close', abortIfRequestAborted);
      res.off('close', abortIfResponseClosed);
    }
  });

  // ---- Critique Theater endpoints (Phase 6) --------------------------------

  // POST /api/projects/:projectId/critique/:runId/interrupt
  // Cascades an AbortController to the in-flight orchestrator for the given run.
  const critiqueInterruptHandler =
    handleCritiqueInterrupt(db, critiqueRunRegistry);
  app.post(
    '/api/projects/:projectId/critique/:runId/interrupt',
    async (req, res) => {
      if (!await ctx.authorizeProjectRequest(
        req,
        res,
        req.params.projectId,
        { mode: 'write', capability: 'writeFiles' },
      )) return;
      critiqueInterruptHandler(req, res);
    },
  );

  // GET /api/projects/:projectId/critique/:runId/artifact
  // Streams the SHIP <ARTIFACT> body the orchestrator persisted, with
  // mime derived from the file extension on disk. Cross-project leak
  // guard mirrors the interrupt route. The web layer fetches this as
  // the logical artifact handle so it never sees daemon paths.
  //
  // Response cap is threaded from cfg.parserMaxBlockBytes so a row that
  // the orchestrator + writer accepted is always retrievable.
  const critiqueArtifactHandler = handleCritiqueArtifact(db, {
    artifactsRoot: critiqueArtifactsRoot,
    responseCapBytes: critiqueResponseCapBytes,
  });
  app.get(
    '/api/projects/:projectId/critique/:runId/artifact',
    async (req, res) => {
      if (!await ctx.authorizeProjectRequest(
        req,
        res,
        req.params.projectId,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      await critiqueArtifactHandler(req, res);
    },
  );

  // ---- API Proxy (SSE) for API-compatible endpoints ------------------------
  // Browser → daemon → external API. Avoids CORS issues with third-party
  // providers. This keeps BYOK setup zero-config for local users at the cost of
  // one local streaming hop through the daemon.

  const redactAuthTokens = (text: string) =>
    text.replace(/Bearer [A-Za-z0-9_\-.+/=]+/g, 'Bearer [REDACTED]');

  // DNS-aware wrapper. The sync `validateBaseUrl` only inspects the literal
  // hostname string, so a public DNS name pointing at an internal address
  // (`internal.example.com → 10.0.0.5`) still passes. We delegate to
  // `validateUserProviderBaseUrl` here so every proxy/stream handler runs the
  // same resolved-IP check before issuing the upstream request.
  const validateExternalApiBaseUrl = (baseUrl: string) => {
    return validateUserProviderBaseUrl(baseUrl);
  };

  const proxyErrorCode = (status: number) => {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 429) return 'RATE_LIMITED';
    return 'UPSTREAM_UNAVAILABLE';
  };

  const sendProxyError = (sse: any, message: string, init: any = {}) => {
    sse.send('error', {
      message,
      error: {
        code: init.code || 'UPSTREAM_UNAVAILABLE',
        message,
        ...(init.details === undefined ? {} : { details: init.details }),
        ...(init.retryable === undefined ? {} : { retryable: init.retryable }),
      },
    });
  };

  const appendVersionedApiPath = (baseUrl: string, path: string) => {
    const url = new URL(baseUrl);
    // `URL.pathname` setter normalizes an empty string back to "/", so
    // we work in a local string to detect the no-path and no-version
    // cases.
    const trimmed = url.pathname.replace(/\/+$/, '');
    // Auto-inject `/v1` whenever the supplied path doesn't already
    // contain a `/vN` segment. This handles all four preset shapes:
    //   bare host                            → /v1/<route>            (api.openai.com, api.anthropic.com)
    //   ends in /vN                          → no inject              (api.openai.com/v1, /v1)
    //   /vN sub-path                         → no inject              (api.deepinfra.com/v1/openai, openrouter.ai/api/v1)
    //   non-versioned compat sub-path        → /v1/<route>            (api.deepseek.com/anthropic, api.minimax.io/anthropic)
    // Previously the check was end-of-path only, which broke the
    // /v1/openai sub-path case. A naive "non-empty path → respect"
    // would break the /anthropic sub-path case. Matching `/vN` as a
    // segment anywhere in the path threads both correctly.
    url.pathname = /\/v\d+(\/|$)/.test(trimmed)
      ? `${trimmed}${path}`
      : `${trimmed}/v1${path}`;
    return url.toString();
  };

  const collectSseFrame = (frame: string) => {
    const lines = frame.replace(/\r/g, '').split('\n');
    const dataLines = [];
    let event = 'message';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      let value = line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      dataLines.push(value);
    }
    const payload = dataLines.join('\n');
    if (!payload) return { event, payload: '', data: null };
    if (payload === '[DONE]') return { event, payload, data: null };
    try {
      return { event, payload, data: JSON.parse(payload) };
    } catch {
      return { event, payload, data: null };
    }
  };

  const streamUpstreamSse = async (response: any, onFrame: any) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const match = buffer.match(/\r?\n\r?\n/);
        if (!match || match.index === undefined) break;
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (await onFrame(collectSseFrame(frame))) {
          // Fire-and-forget cancel: awaiting hangs on some response-stream
          // implementations (notably Response built from Uint8Array body,
          // exposed by tests/proxy-routes.test.ts ollama case where the
          // mock body's tee'd cancel() never resolves). The cancel signal
          // is a hint; we're already returning from the function, so we
          // don't gain anything by blocking on it.
          void reader.cancel().catch(() => {});
          return;
        }
      }
    }

    const tail = buffer.trim();
    if (tail) await onFrame(collectSseFrame(tail));
  };

  const streamUpstreamNdjson = async (response: any, onFrame: any) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (await onFrame({ data })) {
            // See note in streamUpstreamSse — fire-and-forget cancel.
            void reader.cancel().catch(() => {});
            return;
          }
        } catch {
          // Ignore malformed provider keepalive lines.
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        const data = JSON.parse(tail);
        await onFrame({ data });
      } catch {
        // Ignore malformed provider tail data.
      }
    }
  };

  const extractOpenAIText = (data: any) => {
    const choices = data?.choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const first = choices[0];
    if (typeof first?.delta?.content === 'string') return first.delta.content;
    if (typeof first?.text === 'string') return first.text;
    return '';
  };

  const extractStreamErrorMessage = (data: any) => {
    const err = data?.error;
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (typeof err?.message === 'string') return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return 'unspecified provider error';
    }
  };

  const extractGeminiText = (data: any) => {
    const candidates = data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return '';
    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part) => part?.text).filter((text) => typeof text === 'string').join('');
  };

  const benignGeminiFinishReasons = new Set(['', 'STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED']);
  const extractGeminiBlockMessage = (data: any) => {
    const feedback = data?.promptFeedback;
    if (typeof feedback?.blockReason === 'string' && feedback.blockReason) {
      const tail = typeof feedback.blockReasonMessage === 'string' && feedback.blockReasonMessage
        ? ` — ${feedback.blockReasonMessage}`
        : '';
      return `Gemini blocked the prompt (${feedback.blockReason})${tail}.`;
    }
    const candidates = data?.candidates;
    if (!Array.isArray(candidates)) return '';
    for (const candidate of candidates) {
      const reason = candidate?.finishReason;
      if (typeof reason !== 'string' || benignGeminiFinishReasons.has(reason)) continue;
      const tail = typeof candidate?.finishMessage === 'string' && candidate.finishMessage
        ? ` — ${candidate.finishMessage}`
        : '';
      return `Gemini stopped the response (${reason})${tail}.`;
    }
    return '';
  };

  // Per-request role-marker guard for BYOK proxy streams (#3247).
  function createDeltaGuard(sse: any) {
    const guard = createRoleMarkerGuard('proxy');
    return {
      sendDelta(text: string) {
        if (guard.contaminated || !text) return;
        const safe = guard.feedText(text);
        if (safe.length > 0) {
          sse.send('delta', { delta: safe });
        }
        if (guard.contaminated) {
          const warn = guard.warningEvent();
          const markerText = warn?.marker ?? '## user';
          sse.send('delta', {
            delta: `\n\n---\n⚠️ **Security warning:** The model attempted to emit a fabricated role marker (\`${markerText}\`). Response was truncated to prevent unauthorized instruction injection. See issue #3247.\n`,
          });
        }
      },
      get contaminated() { 
        return guard.contaminated; 
      },
    };
  }

  // ---- Reusable base-chat streamers (text only — no tool loop) -------------
  // Both the native /api/proxy/{anthropic,google}/stream routes AND the
  // AIHubMix model-routed proxy call these. Only the resolved url + headers
  // differ (AIHubMix adds the APP-Code header and a different origin), so the
  // wire/SSE handling lives here once. The OpenAI tool loop stays in
  // registerByokToolChatProxy.

  const buildAnthropicChatPayload = (
    model: string,
    systemPrompt: unknown,
    messages: unknown,
    maxTokens: unknown,
  ) => {
    const payload: any = {
      model,
      max_tokens:
        typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      messages: Array.isArray(messages) ? messages : [],
      stream: true,
    };
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payload.system = systemPrompt;
    }
    return payload;
  };

  // A BYOK proxy stream must unwind when the client disconnects (Stop or a
  // closed tab); otherwise the upstream completion — and any tool loop that
  // would fire further paid image/video/speech rounds — keeps streaming and
  // billing after the user is gone. Every upstream fetch below carries this
  // signal. Mirrors the AbortController wiring already used by
  // `/api/provider/models` and `/api/test/connection`.
  const clientDisconnectSignal = (res: any, req?: any): AbortSignal => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on('close', abort);
    if (req) req.on('close', abort);
    return controller.signal;
  };

  const runAnthropicChatStream = async (
    res: any,
    opts: { url: string; headers: Record<string, string>; payload: any; logTag: string },
  ) => {
    const sse = createSseResponse(res);
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      const signal = clientDisconnectSignal(res);
      sse.send('start', { model: opts.payload?.model });
      const response = await fetch(opts.url, {
        ...proxyDispatcher.requestInit,
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[${opts.logTag}] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      const guard = createDeltaGuard(sse);
      await streamUpstreamSse(response, ({ event, data }: any) => {
        if (!data) return false;
        if (event === 'error' || data.type === 'error') {
          const message = data.error?.message || data.message || 'Anthropic upstream error';
          sendProxyError(sse, message, { details: data });
          ended = true;
          return true;
        }
        if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
          guard.sendDelta(data.delta.text);
          if (guard.contaminated) {
            sse.send('end', {});
            ended = true;
            return true;
          }
        }
        if (event === 'message_stop') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[${opts.logTag}] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    } finally {
      await proxyDispatcher?.close();
    }
  };

  const buildGeminiChatPayload = (
    systemPrompt: unknown,
    messages: unknown,
    maxTokens: unknown,
  ) => {
    const contents = (Array.isArray(messages) ? messages : []).map((message: any) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const payload: any = {
      contents,
      generationConfig: {
        maxOutputTokens:
          typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : 8192,
      },
    };
    if (typeof systemPrompt === 'string' && systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    return payload;
  };

  const runGeminiChatStream = async (
    res: any,
    opts: { url: string; headers: Record<string, string>; payload: any; model: string; logTag: string },
  ) => {
    const sse = createSseResponse(res);
    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      const signal = clientDisconnectSignal(res);
      sse.send('start', { model: opts.model });
      const response = await fetch(opts.url, {
        ...proxyDispatcher.requestInit,
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.payload),
        redirect: 'error',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[${opts.logTag}] upstream error: ${response.status} ${redactAuthTokens(errorText)}`,
        );
        sendProxyError(sse, `Upstream error: ${response.status}`, {
          code: proxyErrorCode(response.status),
          details: errorText,
          retryable: response.status === 429 || response.status >= 500,
        });
        return sse.end();
      }

      let ended = false;
      const guard = createDeltaGuard(sse);
      await streamUpstreamSse(response, ({ data }: any) => {
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Gemini error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractGeminiText(data);
        if (delta) {
          guard.sendDelta(delta);
          if (guard.contaminated) {
            sse.send('end', {});
            ended = true;
            return true;
          }
        }
        const blockMessage = extractGeminiBlockMessage(data);
        if (blockMessage) {
          sendProxyError(sse, blockMessage, { details: data });
          ended = true;
          return true;
        }
        return false;
      });
      if (!ended) sse.send('end', {});
      sse.end();
    } catch (err: any) {
      console.error(`[${opts.logTag}] internal error: ${err.message}`);
      sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      sse.end();
    } finally {
      await proxyDispatcher?.close();
    }
  };

  // ---- Shared media tool-loop helpers (BYOK aihubmix only) ----------------
  // The daemon authors ONE OpenAI-shaped tool array (BYOK_AIHUBMIX_TOOLS) and
  // ONE tool-result content vocabulary. These helpers adapt both to the
  // Anthropic Messages and Gemini generateContent native wires so an aihubmix
  // claude/gemini chat model gets the same in-chat generate_image/video/speech
  // tools the OpenAI family already has. They are pure (no request state), so
  // they live at registerChatRoutes scope and are reused across requests.

  // Tool-result content fed back to the model after a media tool runs. Same
  // hints across all three wire protocols (OpenAI `tool` role, Anthropic
  // `tool_result` block, Gemini `functionResponse`): tell the model the URL
  // and exactly how to embed it (markdown image for PNG, link for MP4/MP3).
  const buildToolResultContent = (result: {
    ok: boolean;
    url?: string;
    error?: string;
    kind?: 'image' | 'video' | 'speech';
  }): string => {
    if (result.ok) {
      if (result.kind === 'video')
        return `Video generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link, e.g. [▶ Play video](${result.url}). Do NOT use markdown image syntax — the chat renderer does not embed <video> tags.`;
      if (result.kind === 'speech')
        return `Speech generated successfully. URL: ${result.url}. Reply to the user with a clickable markdown link to the MP3, e.g. [▶ Play voiceover](${result.url}).`;
      return `Image generated successfully. URL: ${result.url}. Reply to the user with: ![generated image](${result.url})`;
    }
    if (result.kind === 'video')
      return `Video generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt or a shorter duration.`;
    if (result.kind === 'speech')
      return `Speech generation failed: ${result.error}. Apologize briefly and suggest a retry with a shorter script or a valid voice id.`;
    return `Image generation failed: ${result.error}. Apologize briefly and suggest a retry with a more specific prompt.`;
  };

  // OpenAI tool definition → Anthropic Messages `tools` shape. Anthropic calls
  // the JSON-schema slot `input_schema` (OpenAI calls it `parameters`).
  const openaiToolsToAnthropic = (tools: any[]): any[] =>
    (Array.isArray(tools) ? tools : []).map((t: any) => ({
      name: t?.function?.name,
      description: t?.function?.description,
      input_schema: t?.function?.parameters ?? { type: 'object', properties: {} },
    }));

  // Gemini's functionDeclaration `parameters` is an OpenAPI-subset Schema that
  // rejects JSON-schema extras (additionalProperties, $schema, default, …). We
  // strip everything outside the allowed key set recursively so the passthrough
  // to Google does not 400 on an unknown field.
  const GEMINI_SCHEMA_KEYS = new Set([
    'type',
    'format',
    'description',
    'nullable',
    'enum',
    'items',
    'properties',
    'required',
  ]);
  const sanitizeGeminiSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
    const out: any = {};
    for (const [k, v] of Object.entries(schema)) {
      if (!GEMINI_SCHEMA_KEYS.has(k)) continue;
      if (k === 'properties' && v && typeof v === 'object') {
        out.properties = {};
        for (const [pk, pv] of Object.entries(v as any)) {
          out.properties[pk] = sanitizeGeminiSchema(pv);
        }
      } else if (k === 'items') {
        out.items = sanitizeGeminiSchema(v);
      } else {
        out[k] = v;
      }
    }
    if (!out.type) out.type = 'object';
    return out;
  };

  // OpenAI tool definitions → Gemini `tools:[{functionDeclarations:[…]}]`.
  const openaiToolsToGemini = (tools: any[]): any[] => [
    {
      functionDeclarations: (Array.isArray(tools) ? tools : []).map((t: any) => ({
        name: t?.function?.name,
        description: t?.function?.description,
        parameters: sanitizeGeminiSchema(t?.function?.parameters),
      })),
    },
  ];

  let infernoModels: InfernoModel[] = [];
  let infernoModelsFetchOk = false;
  let infernoModelsFetched = false;

  const infernoStatusBody = (apiKey: string | null) => {
    const apiKeyConfigured = Boolean(apiKey);
    return {
      ready: apiKeyConfigured && infernoModelsFetchOk && infernoModels.length > 0,
      models: apiKeyConfigured ? infernoModels : [],
      apiKeyConfigured,
      apiKeyTail: apiKey ? infernoKeyTail(apiKey) : null,
    };
  };

  const refreshInfernoModels = async (apiKey: string) => {
    infernoModelsFetched = true;
    try {
      infernoModels = await fetchInfernoModels(apiKey);
      infernoModelsFetchOk = true;
    } catch (err) {
      infernoModels = [];
      infernoModelsFetchOk = false;
      throw err;
    }
  };

  const sendInfernoError = (res: any, err: InfernoError) =>
    sendApiError(res, infernoErrorHttpStatus(err.code), err.code, err.message);

  app.put('/api/inferno/key', async (req, res) => {
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
    try {
      await saveInfernoApiKey(ctx.paths.RUNTIME_DATA_DIR, apiKey);
      resetInfernoProxyState();
      const stored = (await readInfernoApiKey(ctx.paths.RUNTIME_DATA_DIR)) ?? apiKey.trim();
      await refreshInfernoModels(stored);
      return res.json(infernoStatusBody(stored));
    } catch (err) {
      if (err instanceof InfernoError) return sendInfernoError(res, err);
      return sendApiError(
        res,
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  app.delete('/api/inferno/key', async (_req, res) => {
    try {
      await clearInfernoApiKey(ctx.paths.RUNTIME_DATA_DIR);
      resetInfernoProxyState();
      infernoModels = [];
      infernoModelsFetchOk = false;
      infernoModelsFetched = false;
      return res.json(infernoStatusBody(null));
    } catch (err) {
      return sendApiError(
        res,
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  app.get('/api/inferno/status', async (_req, res) => {
    try {
      const apiKey = await readInfernoApiKey(ctx.paths.RUNTIME_DATA_DIR);
      if (apiKey && !infernoModelsFetched) {
        try {
          await refreshInfernoModels(apiKey);
        } catch {
          // Status reports not-ready; never include the raw key.
        }
      }
      return res.json(infernoStatusBody(apiKey));
    } catch (err) {
      return sendApiError(
        res,
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  const pipeInfernoUpstreamSse = async (
    sse: any,
    dialect: 'openai' | 'anthropic' | 'google',
    response: Response,
  ) => {
    let ended = false;
    const guard = createDeltaGuard(sse);
    if (dialect === 'anthropic') {
      await streamUpstreamSse(response, ({ event, data }: any) => {
        if (!data) return false;
        if (event === 'error' || data.type === 'error') {
          const message = data.error?.message || data.message || 'Anthropic upstream error';
          sendProxyError(sse, message, { details: data });
          ended = true;
          return true;
        }
        if (event === 'content_block_delta' && typeof data.delta?.text === 'string') {
          guard.sendDelta(data.delta.text);
          if (guard.contaminated) {
            sse.send('end', {});
            ended = true;
            return true;
          }
        }
        if (event === 'message_stop') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        return false;
      });
    } else if (dialect === 'google') {
      await streamUpstreamSse(response, ({ data }: any) => {
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Gemini error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractGeminiText(data);
        if (delta) {
          guard.sendDelta(delta);
          if (guard.contaminated) {
            sse.send('end', {});
            ended = true;
            return true;
          }
        }
        const blockMessage = extractGeminiBlockMessage(data);
        if (blockMessage) {
          sendProxyError(sse, blockMessage, { details: data });
          ended = true;
          return true;
        }
        return false;
      });
    } else {
      await streamUpstreamSse(response, ({ payload, data }: any) => {
        if (payload === '[DONE]') {
          sse.send('end', {});
          ended = true;
          return true;
        }
        if (!data) return false;
        const streamError = extractStreamErrorMessage(data);
        if (streamError) {
          sendProxyError(sse, `Provider error: ${streamError}`, { details: data });
          ended = true;
          return true;
        }
        const delta = extractOpenAIText(data);
        if (delta) {
          guard.sendDelta(delta);
          if (guard.contaminated) {
            sse.send('end', {});
            ended = true;
            return true;
          }
        }
        return false;
      });
    }
    if (!ended) sse.send('end', {});
  };

  app.post('/api/proxy/inferno/stream', async (req, res) => {
    const proxyBody = req.body || {};
    if (rejectProxyPluginContext(proxyBody, res)) return;
    const { model, systemPrompt, messages, maxTokens } = proxyBody;
    if (typeof model !== 'string' || !model.trim()) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'model is required');
    }

    const apiKey = await readInfernoApiKey(ctx.paths.RUNTIME_DATA_DIR);
    if (!apiKey) {
      return sendApiError(
        res,
        401,
        INFERNO_ERROR_CODES.KEY_REQUIRED,
        'Inferno API key is required',
      );
    }

    if (!infernoModelsFetched) {
      try {
        await refreshInfernoModels(apiKey);
      } catch {
        // Not ready if models fetch failed; never include the raw key.
      }
    }
    if (!infernoStatusBody(apiKey).ready) {
      return sendInfernoError(
        res,
        new InfernoError(INFERNO_ERROR_CODES.NOT_READY, 'Inferno is not ready.'),
      );
    }

    let proxyDispatcher: ReturnType<typeof proxyDispatcherRequestInit> | null = null;
    try {
      proxyDispatcher = proxyDispatcherRequestInit();
      const signal = clientDisconnectSignal(res, req);
      const opened = await openInfernoUpstream({
        model,
        apiKey,
        systemPrompt,
        messages,
        maxTokens,
        ownedBy: infernoModels.find((row) => row.id === model)?.ownedBy ?? null,
        signal,
        requestInit: proxyDispatcher.requestInit,
      });
      if (!opened.ok) return sendInfernoError(res, opened.error);

      console.log(`[proxy:inferno] ${req.method} dialect=${opened.dialect} model=${model}`);
      const sse = createSseResponse(res);
      sse.send('start', { model });
      try {
        await pipeInfernoUpstreamSse(sse, opened.dialect, opened.response);
      } catch (err: any) {
        console.error(`[proxy:inferno] internal error: ${err.message}`);
        sendProxyError(sse, err.message, { code: 'INTERNAL_ERROR' });
      }
      sse.end();
    } catch (err: any) {
      if (!res.headersSent) {
        return sendApiError(
          res,
          500,
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : String(err),
        );
      }
    } finally {
      await proxyDispatcher?.close();
    }
  });

  const INFERNO_ONLY_PROXY_MESSAGE = 'Only Inferno is available.';
  for (const provider of ['openai', 'anthropic', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix']) {
    app.post(`/api/proxy/${provider}/stream`, (_req, res) => {
      sendApiError(res, 403, 'FORBIDDEN', INFERNO_ONLY_PROXY_MESSAGE);
    });
  }

  app.post('/api/proxy/:provider/stream', (req, res) => {
    const proxyBody = req.body || {};
    const provider = typeof req.params.provider === 'string' ? req.params.provider : 'unknown';
    const reasoningDenial = authorizeReasoningEgress({
      policy: proxyBody.reasoningExecution,
      routeKind: 'proxy',
      provider,
      resolvedBaseUrl: typeof proxyBody.baseUrl === 'string' ? proxyBody.baseUrl : undefined,
      model: typeof proxyBody.model === 'string' ? proxyBody.model : undefined,
    });
    if (reasoningDenial) return sendReasoningEgressDenial(res, reasoningDenial);
    return sendApiError(res, 404, 'NOT_FOUND', 'unknown proxy provider');
  });

}
