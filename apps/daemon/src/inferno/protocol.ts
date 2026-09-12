export type InfernoDialect = 'openai' | 'anthropic' | 'google';

function normalizeOwnedBy(ownedBy?: string | null): InfernoDialect | null {
  if (!ownedBy) return null;
  const v = ownedBy.trim().toLowerCase();
  if (v === 'anthropic' || v === 'claude') return 'anthropic';
  if (v === 'google' || v === 'gemini') return 'google';
  if (v === 'openai' || v === 'openai-compatible' || v === 'xai' || v === 'inferno') {
    return 'openai';
  }
  return null;
}

export function resolveInfernoDialect(
  modelId: string,
  ownedBy?: string | null,
): InfernoDialect {
  const fromOwner = normalizeOwnedBy(ownedBy);
  if (fromOwner) return fromOwner;
  const id = modelId.trim().toLowerCase();
  if (
    id.includes('claude') ||
    id.includes('anthropic') ||
    id.includes('sonnet') ||
    id.includes('opus') ||
    id.includes('haiku')
  ) {
    return 'anthropic';
  }
  if (id.includes('gemini')) return 'google';
  return 'openai';
}

const NEXT: Record<InfernoDialect, InfernoDialect> = {
  openai: 'anthropic',
  anthropic: 'google',
  google: 'openai',
};

export function nextInfernoDialect(failed: InfernoDialect): InfernoDialect {
  return NEXT[failed];
}

export function isInfernoProtocolShapeError(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 404 && status !== 415 && status !== 422) return false;
  const t = bodyText.toLowerCase();
  return (
    t.includes('unknown field') ||
    t.includes('invalid') ||
    t.includes('not found') ||
    t.includes('unrecognized') ||
    t.includes('messages') ||
    t.includes('chat/completions')
  );
}
