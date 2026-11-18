import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Move, PlayerView, RoomStatePayload } from '@domino/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { TIMEOUT_TEXT } from '../lobby/errors';
import { createFakeSocket, deferred, hello, type FakeSocket } from '../test/fakeSocket';
import { makeRoom, makeView } from '../test/fixtures';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);
const allById = (id: string | RegExp) => screen.queryAllByTestId(id);

const handTiles = () => allById(/^hand-tile-/);
const play = (tile: [number, number], end: 'left' | 'right') => ({ type: 'play', tile, end });

/** App + hello + room:state с переданным видом. */
function setup(view: PlayerView = makeView(), overrides: Partial<RoomStatePayload> = {}) {
  const { fake, socket } = createFakeSocket();
  const utils = render(<App socket={socket} />);
  fake.serverEmit('server:hello', hello());
  fake.serverEmit('room:state', makeRoom(view, overrides));
  return { fake, ...utils };
}

async function flush() {
  await act(async () => {});
}

function expectAllControlsDisabled() {
  for (const tile of handTiles()) expect(tile).toBeDisabled();
  expect(byId('draw-button')).toBeDisabled();
  expect(byId('pass-button')).toBeDisabled();
}

/** GT-4: стол 3…5, кость [3,5] подходит к обоим концам. */
function twoEndsView(extra: Move[] = []): PlayerView {
  return makeView({
    hand: [
      [3, 5],
      [1, 2],
      [0, 3],
    ],
    board: [
      { tile: [3, 6], left: 3, right: 6 },
      { tile: [5, 6], left: 6, right: 5 },
    ],
    legalMoves: [
      { type: 'play', tile: [3, 5], end: 'left' },
      { type: 'play', tile: [3, 5], end: 'right' },
      ...extra,
    ],
  });
}

function moveCalls(fake: FakeSocket) {
  return fake.emitWithAck.mock.calls.filter(([event]) => event === 'game:move');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('GameTable', () => {
  it('GT-1: start of the round, my turn — only the opening double is playable', () => {
    setup();
    expect(handTiles()).toHaveLength(7);
    expect(byId('hand-tile-6-6')).toHaveAttribute('data-playable', 'true');
    expect(byId('hand-tile-6-6')).toBeEnabled();
    for (const tile of handTiles().filter((t) => t.dataset.testid !== 'hand-tile-6-6')) {
      expect(tile).toBeDisabled();
      expect(tile).toHaveAttribute('data-playable', 'false');
    }
    expect(byId('board-empty')).toBeInTheDocument();
    expect(allById('opponent-tile')).toHaveLength(7);
    expect(byId('opponent-hand-count')).toHaveTextContent(/^7$/);
    expect(byId('boneyard-count')).toHaveTextContent(/^14$/);
    expect(byId('turn-indicator')).toHaveAttribute('data-my-turn', 'true');
    expect(byId('turn-indicator')).toHaveTextContent('Ваш ход');
    expect(byId('draw-button')).toBeDisabled();
    expect(byId('pass-button')).toBeDisabled();
    // data-testid из #5 сохранены
    expect(byId('game-screen')).toBeInTheDocument();
    expect(byId('player-name-0')).toHaveTextContent(/^Аня \(вы\)$/);
    expect(byId('player-name-1')).toHaveTextContent(/^Боб$/);
  });

  it('GT-2: a click sends exactly one game:move, everything is disabled while pending', async () => {
    const { fake } = setup();
    const ack = deferred<unknown>();
    fake.emitWithAck.mockReturnValueOnce(ack.promise);

    fireEvent.click(byId('hand-tile-6-6'));
    fireEvent.click(byId('hand-tile-6-6'));
    expect(moveCalls(fake)).toEqual([['game:move', { move: play([6, 6], 'right') }]]);
    expectAllControlsDisabled();

    await act(async () => ack.resolve({ ok: true }));
    expect(byId('hand-tile-6-6')).toBeEnabled();
    expect(moveCalls(fake)).toHaveLength(1);
  });

  it("GT-3: opponent's turn — nothing is clickable", () => {
    const { fake } = setup(makeView({ currentPlayer: 1, legalMoves: [] }));
    expect(byId('turn-indicator')).toHaveTextContent('Ход соперника: Боб');
    expect(byId('turn-indicator')).toHaveAttribute('data-my-turn', 'false');
    expectAllControlsDisabled();
    for (const tile of handTiles()) expect(tile).toHaveAttribute('data-playable', 'false');
    fireEvent.click(byId('hand-tile-6-6'));
    fireEvent.click(byId('draw-button'));
    expect(fake.emitWithAck).not.toHaveBeenCalled();
  });

  it('GT-4: a tile fitting both ends asks for the end, then plays on the chosen one', () => {
    const { fake } = setup(twoEndsView());
    expect(queryById('end-left')).toBeNull();
    fireEvent.click(byId('hand-tile-3-5'));
    expect(byId('hand-tile-3-5')).toHaveAttribute('data-selected', 'true');
    expect(byId('end-left')).toHaveTextContent('◀ сюда');
    expect(byId('end-right')).toHaveTextContent('сюда ▶');
    expect(fake.emitWithAck).not.toHaveBeenCalled();

    fake.emitWithAck.mockResolvedValueOnce({ ok: true });
    fireEvent.click(byId('end-left'));
    expect(moveCalls(fake)).toEqual([['game:move', { move: play([3, 5], 'left') }]]);
    expect(queryById('end-left')).toBeNull();
  });

  it('GT-5: leaving the end choice — same tile again, Escape, another one-end tile', async () => {
    const { fake } = setup(twoEndsView([{ type: 'play', tile: [0, 3], end: 'left' }]));

    fireEvent.click(byId('hand-tile-3-5'));
    fireEvent.click(byId('hand-tile-3-5'));
    expect(byId('hand-tile-3-5')).toHaveAttribute('data-selected', 'false');
    expect(queryById('end-left')).toBeNull();

    fireEvent.click(byId('hand-tile-3-5'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(byId('hand-tile-3-5')).toHaveAttribute('data-selected', 'false');
    expect(queryById('end-right')).toBeNull();
    expect(fake.emitWithAck).not.toHaveBeenCalled();

    fake.emitWithAck.mockResolvedValueOnce({ ok: true });
    fireEvent.click(byId('hand-tile-3-5'));
    fireEvent.click(byId('hand-tile-0-3'));
    expect(moveCalls(fake)).toEqual([['game:move', { move: play([0, 3], 'left') }]]);
    await flush();
  });

  it('GT-6: only draw is legal', async () => {
    const { fake } = setup(
      makeView({ board: [{ tile: [6, 6], left: 6, right: 6 }], legalMoves: [{ type: 'draw' }] }),
    );
    for (const tile of handTiles()) expect(tile).toBeDisabled();
    expect(byId('draw-button')).toBeEnabled();
    expect(byId('pass-button')).toBeDisabled();
    fake.emitWithAck.mockResolvedValueOnce({ ok: true });
    fireEvent.click(byId('draw-button'));
    expect(moveCalls(fake)).toEqual([['game:move', { move: { type: 'draw' } }]]);
    await flush();
  });

  it('GT-7: only pass is legal with an empty boneyard', async () => {
    const { fake } = setup(
      makeView({
        board: [{ tile: [6, 6], left: 6, right: 6 }],
        boneyardCount: 0,
        legalMoves: [{ type: 'pass' }],
      }),
    );
    expect(byId('pass-button')).toBeEnabled();
    expect(byId('draw-button')).toBeDisabled();
    fake.emitWithAck.mockResolvedValueOnce({ ok: true });
    fireEvent.click(byId('pass-button'));
    expect(moveCalls(fake)).toEqual([['game:move', { move: { type: 'pass' } }]]);
    await flush();
  });

  it.each([
    [
      'ack TILE_DOES_NOT_FIT',
      (f: FakeSocket) =>
        f.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'TILE_DOES_NOT_FIT' }),
      'Так сходить нельзя — обновляем стол',
    ],
    [
      'rejected ack',
      (f: FakeSocket) => f.emitWithAck.mockRejectedValueOnce(new Error('timeout')),
      TIMEOUT_TEXT,
    ],
  ])('GT-8: %s → move-error, controls enabled again', async (_name, arrange, text) => {
    const { fake } = setup();
    arrange(fake);
    fireEvent.click(byId('hand-tile-6-6'));
    await flush();
    expect(byId('move-error')).toHaveTextContent(text);
    expect(byId('hand-tile-6-6')).toBeEnabled();
  });

  it('GT-9: a new room:state resets the error and the selected tile', async () => {
    const { fake } = setup(twoEndsView());
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'NOT_YOUR_TURN' });
    fireEvent.click(byId('hand-tile-3-5'));
    fireEvent.click(byId('end-right'));
    await flush();
    expect(byId('move-error')).toHaveTextContent('Сейчас ход соперника');

    fake.serverEmit('room:state', makeRoom(twoEndsView()));
    expect(byId('move-error')).toBeEmptyDOMElement();

    fireEvent.click(byId('hand-tile-3-5'));
    expect(byId('end-left')).toBeInTheDocument();
    fake.serverEmit('room:state', makeRoom(twoEndsView()));
    expect(byId('hand-tile-3-5')).toHaveAttribute('data-selected', 'false');
    expect(queryById('end-left')).toBeNull();
  });

  it('GT-10: the chain is drawn in payload order, doubles across', () => {
    setup(
      makeView({
        currentPlayer: 1,
        legalMoves: [],
        board: [
          { tile: [1, 1], left: 1, right: 1 },
          { tile: [1, 4], left: 1, right: 4 },
          { tile: [2, 4], left: 4, right: 2 },
        ],
      }),
    );
    const tiles = allById(/^board-tile-/);
    expect(tiles.map((t) => t.dataset.testid)).toEqual([
      'board-tile-0',
      'board-tile-1',
      'board-tile-2',
    ]);
    expect(tiles.map((t) => [t.dataset.left, t.dataset.right])).toEqual([
      ['1', '1'],
      ['1', '4'],
      ['4', '2'],
    ]);
    expect(tiles[0]).toHaveAttribute('data-orientation', 'vertical');
    expect(tiles[1]).toHaveAttribute('data-orientation', 'horizontal');
    expect(within(tiles[2]!).getByRole('img', { name: '4-2' })).toHaveClass('tile--horizontal');
    expect(queryById('board-empty')).toBeNull();
  });

  it('GT-11: disconnect during my turn keeps the table but disables everything', () => {
    const { fake } = setup();
    fake.serverEmit('disconnect', 'transport close');
    expect(byId('board')).toBeInTheDocument();
    expect(handTiles()).toHaveLength(7);
    expectAllControlsDisabled();
    fireEvent.click(byId('hand-tile-6-6'));
    expect(fake.emitWithAck).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'domino', 'Вы выиграли раунд: +17'],
    [1, 'domino', 'Раунд выиграл Боб: +17'],
    [1, 'fish', 'Раунд выиграл Боб: +17 (рыба)'],
    [null, 'fish', 'Рыба — ничья'],
  ] as const)('GT-12: finished, winner %s (%s) → "%s"', (winner, reason, text) => {
    setup(
      makeView({
        status: 'finished',
        board: [{ tile: [6, 6], left: 6, right: 6 }],
        legalMoves: [],
        result: { winner, reason, points: winner === null ? 0 : 17, handPoints: [0, 17] },
      }),
    );
    expect(byId('round-finished')).toHaveTextContent(text);
    expect(queryById('turn-indicator')).toBeNull();
    expectAllControlsDisabled();
    expect(byId('board-tile-0')).toBeInTheDocument();
  });

  it('GT-13: opponent-offline still works inside the table', () => {
    const { fake } = setup();
    const offline = makeRoom(makeView(), {
      players: [
        { seat: 0, name: 'Аня', connected: true },
        { seat: 1, name: 'Боб', connected: false },
      ],
    });
    fake.serverEmit('room:state', offline);
    expect(byId('opponent-offline')).toHaveTextContent('Соперник отключился, ждём возвращения…');
    expect(byId('board')).toBeInTheDocument();
    fake.serverEmit('room:state', makeRoom());
    expect(queryById('opponent-offline')).toBeNull();
  });

  it('GT-14: unmount while pending — no errors after unmount, keydown listener removed', async () => {
    const errors = vi.spyOn(console, 'error');
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');

    const first = setup(twoEndsView());
    fireEvent.click(byId('hand-tile-3-5'));
    const keydown = added.mock.calls.find(([type]) => type === 'keydown')?.[1];
    expect(keydown).toBeDefined();
    first.unmount();
    expect(removed).toHaveBeenCalledWith('keydown', keydown);

    const second = setup();
    const ack = deferred<unknown>();
    second.fake.emitWithAck.mockReturnValueOnce(ack.promise);
    fireEvent.click(byId('hand-tile-6-6'));
    second.unmount();
    await act(async () => ack.resolve({ ok: false, error: 'NOT_YOUR_TURN' }));
    expect(errors).not.toHaveBeenCalled();
  });
});
