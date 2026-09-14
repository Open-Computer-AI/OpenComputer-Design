// @vitest-environment jsdom
/**
 * Inferno HTTP turns persist the model reply on `message.content` and only a
 * `requesting` status on `message.events`. Preferring any non-empty events
 * array over content drops that reply, so the row is just a green Done.
 *
 * Fixture matches the stored terra turn (user said "Hi"): content is the
 * spoken reply, events are status-only, runStatus is succeeded.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { en } from '../../../src/i18n/locales/en';
import type { ChatMessage } from '../../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

function infernoHttpReply(): ChatMessage {
  return {
    id: 'home-auto-send-3w1tw7ukcn5uc-assistant',
    role: 'assistant',
    content: 'Hi! What would you like to design?',
    agentId: 'inferno',
    agentName: 'Inferno · gpt-5.6-terra',
    runStatus: 'succeeded',
    startedAt: 1789370000000,
    endedAt: 1789370001500,
    createdAt: 1789370001500,
    events: [{ kind: 'status', label: 'requesting', detail: 'gpt-5.6-terra' }],
    producedFiles: [],
  } as ChatMessage;
}

function renderTurn(message: ChatMessage) {
  return render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
}

describe('Inferno HTTP reply stored in content with status-only events', () => {
  it('shows the spoken reply as prose, not only a Done footer', () => {
    const { container } = renderTurn(infernoHttpReply());
    const prose = container.querySelector('.prose-block');
    expect(
      prose?.textContent,
      'the stored Inferno reply must appear outside the collapsed execution shell',
    ).toContain('Hi! What would you like to design?');
    expect(container.querySelector('[data-testid="assistant-label"]')?.textContent).toBe(
      en['assistant.doneLabel'],
    );
  });

  it('does not duplicate a reply that is already a text event', () => {
    const { container } = renderTurn({
      ...infernoHttpReply(),
      events: [
        { kind: 'status', label: 'requesting', detail: 'gpt-5.6-terra' },
        { kind: 'text', text: 'Hi! What would you like to design?' },
      ],
    });
    const prose = [...container.querySelectorAll('.prose-block')]
      .map((node) => node.textContent ?? '')
      .join('');
    expect(prose.match(/Hi! What would you like to design\?/g)).toHaveLength(1);
  });
});

