import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  REACTION_COOLDOWN_MS,
  REACTION_IDS,
  REACTION_SHOW_MS,
  REACTIONS,
  type PlayerView,
  type ReactionErrorCode,
} from '@domino/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { TIMEOUT_TEXT } from '../lobby/errors';
import { createFakeSocket, deferred, hello, type FakeSocket } from '../test/fakeSocket';
import { makeRoom, makeView } from '../test/fixtures';
import { REACTION_ERROR_TEXT } from './errors';
import { REACTION_ERROR_MS } from './useReactions';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);

/** Конец раунда у `you = 0` (экран итогов). */
const finishedView: PlayerView = makeView({
  status: 'finished',
  hand: [[2, 5]],
  opponentHandCount: 1,
  opponentHand: [[1, 2]],
  board: [{ tile: [3, 6], left: 3, right: 6 }],
  currentPlayer: 1,
  legalMoves: [],
  result: { reason: 'domino', winner: 0, points: 3, handPoints: [0, 3] },
});

function setup(view: PlayerView = makeView()) {
  vi.useFakeTimers();
  const { fake, socket } = createFakeSocket();
  const utils = render(<App socket={socket} />);
  fake.serverEmit('server:hello', hello());
  fake.serverEmit('room:state', makeRoom(view));
  return { fake, ...utils };
}

function reactionCalls(fake: FakeSocket) {
  return fake.emitWithAck.mock.calls.filter(([event]) => event === 'game:react');
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

async function flush() {
  await act(async () => {});
}

function openPanel() {
  if (!queryById('reaction-panel')) fireEvent.click(byId('reaction-toggle'));
}

function reactionButtons() {
  return REACTION_IDS.map((id) => byId(`reaction-${id}`));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('reactions (spec-12)', () => {
  it('RX10a: opponent reaction is shown for exactly 3 s', () => {
    const { fake } = setup();
    fake.serverEmit('room:reaction', { seat: 1, reactionId: 'laugh', seq: 1 });
    const bubble = byId('reaction-bubble-opponent');
    expect(bubble).toHaveTextContent('😂');
    expect(bubble).toHaveAttribute('data-reaction-id', 'laugh');
    expect(byId('reaction-anchor-opponent')).toContainElement(bubble);
    advance(REACTION_SHOW_MS - 1);
    expect(queryById('reaction-bubble-opponent')).toBeInTheDocument();
    advance(1);
    expect(queryById('reaction-bubble-opponent')).toBeNull();
  });

  it('RX10b: a new reaction of the same seat replaces the bubble and restarts 3 s', () => {
    const { fake } = setup();
    fake.serverEmit('room:reaction', { seat: 1, reactionId: 'laugh', seq: 1 });
    advance(2000);
    fake.serverEmit('room:reaction', { seat: 1, reactionId: 'fish', seq: 2 });
    expect(screen.getAllByTestId('reaction-bubble-opponent')).toHaveLength(1);
    expect(byId('reaction-bubble-opponent')).toHaveTextContent('Рыба!');
    advance(REACTION_SHOW_MS - 1);
    expect(byId('reaction-bubble-opponent')).toHaveAttribute('data-reaction-id', 'fish');
    advance(1);
    expect(queryById('reaction-bubble-opponent')).toBeNull();
  });

  it('RX10c: bubbles of both seats are visible at once; mine is in its own anchor', () => {
    const { fake } = setup();
    fake.serverEmit('room:reaction', { seat: 1, reactionId: 'angry', seq: 1 });
    fake.serverEmit('room:reaction', { seat: 0, reactionId: 'good_game', seq: 2 });
    expect(byId('reaction-bubble-opponent')).toHaveTextContent('😡');
    expect(byId('reaction-bubble-mine')).toHaveTextContent('Хорошая игра');
    expect(byId('reaction-anchor-mine')).toContainElement(byId('reaction-bubble-mine'));
  });

  it('RX10d: on the round summary both anchors and the toggle are present', () => {
    const { fake } = setup(finishedView);
    expect(byId('round-summary')).toBeInTheDocument();
    expect(byId('reaction-anchor-opponent')).toBeInTheDocument();
    expect(byId('reaction-anchor-mine')).toBeInTheDocument();
    expect(byId('reaction-toggle')).toBeInTheDocument();
    fake.serverEmit('room:reaction', { seat: 1, reactionId: 'good_game', seq: 1 });
    expect(byId('reaction-bubble-opponent')).toHaveTextContent('Хорошая игра');
  });

  it('RX11a: click sends game:react, closes the panel, no optimistic bubble', async () => {
    const { fake } = setup();
    const ack = deferred<unknown>();
    fake.emitWithAck.mockReturnValueOnce(ack.promise);
    expect(queryById('reaction-panel')).toBeNull();
    fireEvent.click(byId('reaction-toggle'));
    expect(byId('reaction-toggle')).toHaveAttribute('aria-expanded', 'true');
    const buttons = reactionButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(REACTIONS.map((r) => r.text));
    expect(byId('reaction-thumbs_up')).toHaveAccessibleName('Класс');
    fireEvent.click(byId('reaction-hurry'));
    expect(reactionCalls(fake)).toEqual([['game:react', { reactionId: 'hurry' }]]);
    expect(queryById('reaction-panel')).toBeNull();
    ack.resolve({ ok: true });
    await flush();
    expect(queryById('reaction-bubble-mine')).toBeNull();
    fake.serverEmit('room:reaction', { seat: 0, reactionId: 'hurry', seq: 7 });
    expect(byId('reaction-bubble-mine')).toHaveTextContent('Ходи уже');
  });

  it('RX11b: buttons are disabled for 2 s after an ok ack', async () => {
    const { fake } = setup();
    fake.emitWithAck.mockResolvedValue({ ok: true });
    openPanel();
    fireEvent.click(byId('reaction-wow'));
    await flush();
    openPanel();
    for (const button of reactionButtons()) expect(button).toBeDisabled();
    fireEvent.click(byId('reaction-wow'));
    expect(reactionCalls(fake)).toHaveLength(1);
    advance(REACTION_COOLDOWN_MS - 1);
    openPanel();
    expect(byId('reaction-wow')).toBeDisabled();
    advance(1);
    for (const button of reactionButtons()) expect(button).toBeEnabled();
  });

  it('RX11c: TOO_FREQUENT / timeout → error text that fades in 3 s', async () => {
    const { fake } = setup();
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'TOO_FREQUENT' });
    openPanel();
    fireEvent.click(byId('reaction-party'));
    await flush();
    expect(byId('reaction-error')).toHaveTextContent('Не так часто');
    advance(REACTION_ERROR_MS);
    expect(byId('reaction-error')).toHaveTextContent(/^$/);

    fake.emitWithAck.mockRejectedValueOnce(new Error('timeout'));
    openPanel();
    expect(byId('reaction-party')).toBeEnabled(); // ошибка не включает кулдаун
    fireEvent.click(byId('reaction-party'));
    await flush();
    expect(byId('reaction-error')).toHaveTextContent(TIMEOUT_TEXT);
    advance(REACTION_ERROR_MS);
    expect(byId('reaction-error')).toHaveTextContent(/^$/);
  });

  it('RX11d: buttons are disabled when the connection is not "connected"', () => {
    const { fake } = setup();
    fake.active = true;
    fake.serverEmit('disconnect', 'transport close');
    openPanel();
    for (const button of reactionButtons()) expect(button).toBeDisabled();
  });

  it('RX11e: Esc and a click outside close the panel', () => {
    setup();
    openPanel();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryById('reaction-panel')).toBeNull();
    openPanel();
    fireEvent.mouseDown(byId('boneyard'));
    expect(queryById('reaction-panel')).toBeNull();
    openPanel();
    fireEvent.click(byId('reaction-toggle'));
    expect(queryById('reaction-panel')).toBeNull();
  });

  it('RX11f: unmount with an active bubble leaves no timers and no listener', async () => {
    const errors = vi.spyOn(console, 'error');
    const { fake, unmount } = setup();
    const before = vi.getTimerCount();
    fake.emitWithAck.mockResolvedValue({ ok: true });
    openPanel();
    fireEvent.click(byId('reaction-fish'));
    await flush();
    fake.serverEmit('room:reaction', { seat: 0, reactionId: 'fish', seq: 1 });
    fake.serverEmit('room:reaction', { seat: 1, reactionId: 'wow', seq: 2 });
    expect(vi.getTimerCount()).toBeGreaterThan(before);
    unmount();
    expect(fake.listenerCount('room:reaction')).toBe(0);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(before);
    advance(REACTION_SHOW_MS);
    expect(errors).not.toHaveBeenCalled();
  });

  it('RX11g: REACTION_ERROR_TEXT covers every ReactionErrorCode with a non-empty text', () => {
    const codes: ReactionErrorCode[] = [
      'INVALID_PAYLOAD',
      'UNKNOWN_REACTION',
      'NOT_IN_ROOM',
      'GAME_NOT_STARTED',
      'TOO_FREQUENT',
    ];
    expect(Object.keys(REACTION_ERROR_TEXT).sort()).toEqual([...codes].sort());
    for (const code of codes) expect(REACTION_ERROR_TEXT[code].length).toBeGreaterThan(0);
  });

  it('RX8: a move and a reaction can be in flight at the same time', async () => {
    const { fake } = setup();
    fake.emitWithAck.mockReturnValue(new Promise(() => {}));
    fireEvent.click(byId('hand-tile-6-6'));
    openPanel();
    expect(byId('reaction-thumbs_up')).toBeEnabled();
    fireEvent.click(byId('reaction-thumbs_up'));
    expect(fake.emitWithAck.mock.calls.map(([event]) => event)).toEqual([
      'game:move',
      'game:react',
    ]);
  });
});
