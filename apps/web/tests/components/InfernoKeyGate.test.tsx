// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canGenerateWithInferno,
  InfernoGenerateGateProvider,
  InfernoGenerateGuard,
  InfernoKeyGate,
  INFERNO_KEY_GATE_ACTION,
  INFERNO_KEY_GATE_MESSAGE,
  useInfernoGenerateGate,
} from '../../src/components/InfernoKeyGate';
import { ChatComposer } from '../../src/components/ChatComposer';
import { ANNOTATION_EVENT } from '../../src/components/PreviewDrawOverlay';
import { I18nProvider } from '../../src/i18n';
import { flushMounts, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function RequestGenerateProbe() {
  const gate = useInfernoGenerateGate();
  return (
    <button
      type="button"
      data-testid="request-generate"
      onClick={() => {
        const allowed = gate.requestGenerate();
        (window as Window & { __infernoAllowed?: boolean }).__infernoAllowed = allowed;
      }}
    >
      generate
    </button>
  );
}

describe('canGenerateWithInferno', () => {
  it('is true only when ready and the catalog has at least one model', () => {
    expect(canGenerateWithInferno({ ready: true, models: [{ id: 'grok-4.5' }] })).toBe(true);
    expect(canGenerateWithInferno({ ready: true, models: [] })).toBe(false);
    expect(canGenerateWithInferno({ ready: false, models: [{ id: 'grok-4.5' }] })).toBe(false);
    expect(canGenerateWithInferno({ ready: false, models: [] })).toBe(false);
    expect(canGenerateWithInferno({ ready: true })).toBe(false);
    expect(canGenerateWithInferno({})).toBe(false);
    expect(canGenerateWithInferno(null)).toBe(false);
  });
});

describe('InfernoKeyGate', () => {
  it('renders the spec copy and Open Settings action', () => {
    const onOpenSettings = vi.fn();
    const onClose = vi.fn();
    render(
      <I18nProvider initial="en">
        <InfernoKeyGate open onOpenSettings={onOpenSettings} onClose={onClose} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('inferno-key-gate')).toBeTruthy();
    expect(screen.getByText(INFERNO_KEY_GATE_MESSAGE)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: INFERNO_KEY_GATE_ACTION }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('requestGenerate / InfernoGenerateGuard', () => {
  it('blocks generate and opens the gate when Inferno is not ready', () => {
    const onOpenGate = vi.fn();
    render(
      <InfernoGenerateGateProvider canGenerate={false} onOpenGate={onOpenGate}>
        <RequestGenerateProbe />
      </InfernoGenerateGateProvider>,
    );

    fireEvent.click(screen.getByTestId('request-generate'));
    expect(onOpenGate).toHaveBeenCalledTimes(1);
    expect((window as Window & { __infernoAllowed?: boolean }).__infernoAllowed).toBe(false);
  });

  it('allows generate without opening the gate when ready', () => {
    const onOpenGate = vi.fn();
    render(
      <InfernoGenerateGateProvider canGenerate onOpenGate={onOpenGate}>
        <RequestGenerateProbe />
      </InfernoGenerateGateProvider>,
    );

    fireEvent.click(screen.getByTestId('request-generate'));
    expect(onOpenGate).not.toHaveBeenCalled();
    expect((window as Window & { __infernoAllowed?: boolean }).__infernoAllowed).toBe(true);
  });

  it('opens the gate when a native-disabled Send/Generate control is clicked', () => {
    const onOpenGate = vi.fn();
    const onClick = vi.fn();
    render(
      <InfernoGenerateGateProvider canGenerate={false} onOpenGate={onOpenGate}>
        <InfernoGenerateGuard>
          <button type="button" disabled onClick={onClick}>
            Send
          </button>
        </InfernoGenerateGuard>
      </InfernoGenerateGateProvider>,
    );

    const guard = screen.getByTestId('inferno-generate-guard');
    expect(guard.classList.contains('is-blocked')).toBe(true);
    fireEvent.click(guard);
    expect(onOpenGate).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ChatComposer Inferno generate gate', () => {
  it('blocks handleSend / Enter when Inferno is not ready', async () => {
    const onSend = vi.fn();
    const onOpenGate = vi.fn();
    render(
      <InfernoGenerateGateProvider canGenerate={false} onOpenGate={onOpenGate}>
        <ChatComposer
          projectId="project-1"
          projectFiles={[]}
          streaming={false}
          onEnsureProject={async () => 'project-1'}
          onSend={onSend}
          onStop={vi.fn()}
        />
      </InfernoGenerateGateProvider>,
    );
    await flushMounts();
    await typeAndSettle('Ship a poster');

    pressEnter();
    expect(onSend).not.toHaveBeenCalled();
    expect(onOpenGate).toHaveBeenCalled();

    onOpenGate.mockClear();
    fireEvent.click(screen.getByTestId('inferno-generate-guard'));
    expect(onSend).not.toHaveBeenCalled();
    expect(onOpenGate).toHaveBeenCalledTimes(1);
  });

  it('blocks sendComposedTurn annotation sends when Inferno is not ready', async () => {
    const onSend = vi.fn();
    const onOpenGate = vi.fn();
    render(
      <InfernoGenerateGateProvider canGenerate={false} onOpenGate={onOpenGate}>
        <ChatComposer
          projectId="project-1"
          projectFiles={[]}
          streaming={false}
          onEnsureProject={async () => 'project-1'}
          onSend={onSend}
          onStop={vi.fn()}
        />
      </InfernoGenerateGateProvider>,
    );
    await flushMounts();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, {
        detail: { note: 'make this blue', action: 'send', filePath: 'index.html', ack: () => {} },
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(onOpenGate).toHaveBeenCalled());
    expect(onSend).not.toHaveBeenCalled();
  });
});
