/**
 * Client-side Inferno system prompt. The HTTP proxy forwards this string
 * as `systemPrompt`; it does not compose skills/memory itself.
 */
import { composeSystemPrompt } from '@open-design/contracts';
import type { ChatSessionMode, ProjectMetadata, WorkspaceCollabContext } from '@open-design/contracts';
import { fetchDesignSystem, fetchDesignTemplate, fetchSkill } from './registry';

export interface InfernoSystemPromptInput {
  locale?: string;
  sessionMode?: ChatSessionMode;
  metadata?: ProjectMetadata;
  skillId?: string | null;
  designSystemId?: string | null;
  designSystemBody?: string;
  designSystemTitle?: string;
  workspaceContext?: WorkspaceCollabContext | null;
}

async function fetchMemoryBody(): Promise<string> {
  try {
    const response = await fetch('/api/memory/system-prompt');
    if (!response.ok) return '';
    const payload = (await response.json()) as { body?: unknown };
    return typeof payload.body === 'string' ? payload.body : '';
  } catch {
    return '';
  }
}

async function fetchSkillOrTemplate(skillId: string, workspaceContext?: WorkspaceCollabContext | null) {
  const skill = await fetchSkill(skillId, workspaceContext);
  if (skill) return skill;
  return fetchDesignTemplate(skillId);
}

export async function composeInfernoSystemPrompt(
  input: InfernoSystemPromptInput = {},
): Promise<string> {
  const [memoryBody, skill, designSystem] = await Promise.all([
    fetchMemoryBody(),
    input.skillId ? fetchSkillOrTemplate(input.skillId, input.workspaceContext) : Promise.resolve(null),
    input.designSystemId && !input.designSystemBody
      ? fetchDesignSystem(input.designSystemId, input.workspaceContext)
      : Promise.resolve(null),
  ]);
  return composeSystemPrompt({
    streamFormat: 'plain',
    locale: input.locale,
    sessionMode: input.sessionMode,
    metadata: input.metadata,
    memoryBody,
    skillBody: skill?.body,
    skillName: skill?.name,
    skillMode: skill?.mode,
    designSystemBody: input.designSystemBody ?? designSystem?.body,
    designSystemTitle: input.designSystemTitle ?? designSystem?.title,
  });
}
