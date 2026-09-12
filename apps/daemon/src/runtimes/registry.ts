import { infernoAgentDef } from './defs/inferno.js';
import type { RuntimeAgentDef } from './types.js';

/**
 * The agents this build ships, before anything a particular machine adds.
 *
 * Inferno is HTTP-only; local CLI profiles are disabled so Claude/Codex/AMR
 * cannot be selected through `/api/agents`.
 */
export const SHIPPED_AGENT_DEFS: RuntimeAgentDef[] = [
  infernoAgentDef,
];

export function readLocalAgentProfileDefs(
  _baseDefs: RuntimeAgentDef[] = SHIPPED_AGENT_DEFS,
): RuntimeAgentDef[] {
  return [];
}

export const AGENT_DEFS: RuntimeAgentDef[] = [
  ...SHIPPED_AGENT_DEFS,
  ...readLocalAgentProfileDefs(SHIPPED_AGENT_DEFS),
];

const ids = new Set();
for (const def of AGENT_DEFS) {
  if (ids.has(def.id)) {
    throw new Error(`Duplicate agent definition id: ${def.id}`);
  }
  ids.add(def.id);
}

export function getAgentDef(id: string): RuntimeAgentDef | null {
  return AGENT_DEFS.find((a) => a.id === id) || null;
}
