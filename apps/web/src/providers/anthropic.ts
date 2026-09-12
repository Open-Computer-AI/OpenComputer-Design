/**
 * API-mode chat stream dispatcher. Inferno is the only provider.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig, ChatMessage } from '../types';
import type { ProxyContext } from './api-proxy';
import { streamMessageInferno } from './inferno';

export { isOpenAICompatible } from './openai-compatible';

export interface StreamHandlers {
  onDelta: (textDelta: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
}

export function makeClient(cfg: AppConfig): Anthropic {
  return new Anthropic({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
  });
}

export async function streamMessage(
  cfg: AppConfig,
  system: string,
  history: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  context?: ProxyContext,
): Promise<void> {
  return streamMessageInferno(cfg, system, history, signal, handlers, context);
}
