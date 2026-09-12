/**
 * Inferno chat stream. Routes through the daemon proxy so the pinned host
 * and stored key never leave the daemon.
 */
import type { AppConfig, ChatMessage } from '../types';
import type { StreamHandlers } from './anthropic';
import { streamProxyEndpoint, type ProxyContext } from './api-proxy';

export async function streamMessageInferno(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamProxyEndpoint(
    '/api/proxy/inferno/stream',
    cfg,
    system,
    history,
    signal,
    handlers,
    context,
    { omitBaseUrl: true, omitApiKey: true },
  );
}
