import type { RuntimeAgentDef } from '../types.js';

export const infernoAgentDef = {
  id: 'inferno',
  name: 'Inferno',
  bin: 'inferno-synthetic',
  synthetic: true,
  versionArgs: ['--version'],
  fallbackModels: [],
  buildArgs: () => {
    throw new Error('Inferno is HTTP-only; do not spawn a CLI');
  },
  streamFormat: 'plain',
  supportsCustomModel: false,
} satisfies RuntimeAgentDef;
