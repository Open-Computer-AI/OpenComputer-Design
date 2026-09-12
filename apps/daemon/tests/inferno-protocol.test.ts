import { describe, expect, it } from 'vitest';
import { INFERNO_BASE_URL, INFERNO_HOST } from '../src/inferno/constants.js';
import { nextInfernoDialect, resolveInfernoDialect } from '../src/inferno/protocol.js';

describe('inferno protocol', () => {
  it('pins https Inferno URL and host', () => {
    expect(INFERNO_BASE_URL).toBe('https://router.tryopencomputer.com/v1');
    expect(INFERNO_HOST).toBe('router.tryopencomputer.com');
    expect(INFERNO_BASE_URL.startsWith('https://')).toBe(true);
  });

  it('routes claude/anthropic/sonnet/opus/haiku to anthropic', () => {
    expect(resolveInfernoDialect('claude-sonnet-4-6')).toBe('anthropic');
    expect(resolveInfernoDialect('anthropic/claude-3-5')).toBe('anthropic');
    expect(resolveInfernoDialect('foo-sonnet')).toBe('anthropic');
    expect(resolveInfernoDialect('opus-x')).toBe('anthropic');
    expect(resolveInfernoDialect('haiku-1')).toBe('anthropic');
  });

  it('routes gemini* to google', () => {
    expect(resolveInfernoDialect('gemini-2.5-flash')).toBe('google');
  });

  it('prefers owned_by over id heuristics', () => {
    expect(resolveInfernoDialect('custom-slot', 'anthropic')).toBe('anthropic');
    expect(resolveInfernoDialect('custom-slot', 'google')).toBe('google');
    expect(resolveInfernoDialect('claude-sonnet-4-6', 'openai')).toBe('openai');
  });

  it('defaults everything else to openai', () => {
    expect(resolveInfernoDialect('gpt-4o')).toBe('openai');
    expect(resolveInfernoDialect('grok-4.5')).toBe('openai');
    expect(resolveInfernoDialect('deepseek-v4-pro')).toBe('openai');
  });

  it('retries openai -> anthropic -> google -> openai', () => {
    expect(nextInfernoDialect('openai')).toBe('anthropic');
    expect(nextInfernoDialect('anthropic')).toBe('google');
    expect(nextInfernoDialect('google')).toBe('openai');
  });
});
