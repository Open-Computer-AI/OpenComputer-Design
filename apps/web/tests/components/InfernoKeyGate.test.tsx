// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canGenerateWithInferno,
  InfernoKeyGate,
  INFERNO_KEY_GATE_ACTION,
  INFERNO_KEY_GATE_MESSAGE,
} from '../../src/components/InfernoKeyGate';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
});

describe('canGenerateWithInferno', () => {
  it('is true only when ready and the catalog has at least one model', () => {
    expect(canGenerateWithInferno({ ready: true, models: [{ id: 'grok-4.5' }] })).toBe(true);
    expect(canGenerateWithInferno({ ready: true, models: [] })).toBe(false);
    expect(canGenerateWithInferno({ ready: false, models: [{ id: 'grok-4.5' }] })).toBe(false);
    expect(canGenerateWithInferno({ ready: false, models: [] })).toBe(false);
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
