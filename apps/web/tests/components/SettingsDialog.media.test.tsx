// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from '../../src/components/SettingsDialog';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo, AppConfig } from '../../src/types';

describe('SettingsDialog media providers', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not list remote image or video providers', () => {
    renderDialog({
      ...DEFAULT_CONFIG,
      mediaProviders: {
        openai: {
          apiKey: '',
          apiKeyConfigured: true,
          apiKeyTail: '1234',
          baseUrl: '',
        },
      },
    });

    expect(screen.queryByRole('tab', { name: /OpenAI/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /ElevenLabs/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Nano Banana/ })).toBeNull();
    expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
    expect(document.querySelector('.media-provider-coming-soon')).toBeNull();
    expect(screen.queryByText('ComfyUI')).toBeNull();
  });
});

function renderDialog(initial: AppConfig) {
  return render(
    <SettingsDialog
      initial={initial}
      agents={SAVEABLE_AGENTS}
      daemonLive
      appVersionInfo={null}
      initialSection="media"
      onPersist={vi.fn()}
      onPersistComposioKey={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
    />,
  );
}

const SAVEABLE_AGENTS: AgentInfo[] = [
  {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    available: true,
  },
];
