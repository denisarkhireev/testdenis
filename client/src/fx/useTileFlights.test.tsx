import { cleanup, render, screen } from '@testing-library/react';
import type { PlayerView } from '@domino/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createFakeSocket, hello } from '../test/fakeSocket';
import { makeRoom, makeView } from '../test/fixtures';
import { fakeSoundPlayer, mockAnimate, mockMatchMedia, mockRects } from '../test/fx';
import { DRAW_MS, PLAY_MS } from './useTileFlights';

const start = makeView();
/** Я сыграл [6,6] на пустой стол, ход соперника. */
const afterMyMove = makeView({
  hand: start.hand.slice(1),
  board: [{ tile: [6, 6], left: 6, right: 6 }],
  currentPlayer: 1,
  legalMoves: [],
});
/** Соперник сыграл [6,1] справа, ход мой. */
const afterOpponentMove = makeView({
  ...afterMyMove,
  opponentHandCount: 6,
  board: [...afterMyMove.board, { tile: [6, 1], left: 6, right: 1 }],
  currentPlayer: 0,
});

function setup() {
  const { fake, socket } = createFakeSocket();
  const sound = fakeSoundPlayer();
  render(<App socket={socket} soundPlayer={sound} />);
  fake.serverEmit('server:hello', hello());
  const state = (view: PlayerView) => fake.serverEmit('room:state', makeRoom(view));
  return { state, sound };
}

let restoreAnimate: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restoreAnimate?.();
  restoreAnimate = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function animated() {
  const mock = mockAnimate();
  restoreAnimate = mock.restore;
  mockRects();
  return mock;
}

describe('useTileFlights (spec-10 §3.2)', () => {
  it('F12: my move — one animation on board-tile-i, 250 ms, starts with translate(', () => {
    const { animate, animations } = animated();
    const { state } = setup();
    state(start);
    state(afterMyMove);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animations[0]!.target).toBe(screen.getByTestId('board-tile-0'));
    expect(animations[0]!.options.duration).toBe(PLAY_MS);
    expect(String(animations[0]!.keyframes[0]!.transform)).toContain('translate(');
    expect(animations[0]!.keyframes.at(-1)!.transform).toBe('none');
  });

  it('F12: opponent move flies to the right end; opponent draw — 180 ms into his hand', () => {
    const { animations } = animated();
    const { state } = setup();
    state(afterMyMove);
    state(afterOpponentMove);
    expect(animations).toHaveLength(1);
    expect(animations[0]!.target).toBe(screen.getByTestId('board-tile-1'));

    state(makeView({ ...afterOpponentMove, currentPlayer: 1 }));
    state(
      makeView({ ...afterOpponentMove, currentPlayer: 1, opponentHandCount: 7, boneyardCount: 13 }),
    );
    expect(animations).toHaveLength(2);
    const tiles = screen.getAllByTestId('opponent-tile');
    expect(animations[1]!.target).toBe(tiles.at(-1));
    expect(animations[1]!.options.duration).toBe(DRAW_MS);
    expect(animations[1]!.keyframes[0]!.opacity).toBe(0);
  });

  it('F12: my draw — the new tile in my hand flies in from the boneyard', () => {
    const { animations } = animated();
    const { state } = setup();
    const before = makeView({ ...afterOpponentMove, legalMoves: [{ type: 'draw' }] });
    state(before);
    state(makeView({ ...before, hand: [...before.hand, [4, 4]], boneyardCount: 13 }));
    expect(animations).toHaveLength(1);
    expect(animations[0]!.target).toBe(screen.getByTestId('hand-tile-4-4'));
    expect(animations[0]!.options.duration).toBe(DRAW_MS);
  });

  it('F13: prefers-reduced-motion → animate is never called', () => {
    const { animate } = animated();
    mockMatchMedia(true);
    const { state } = setup();
    state(start);
    state(afterMyMove);
    state(afterOpponentMove);
    expect(animate).not.toHaveBeenCalled();
  });

  it('F13: reduced motion switched in the OS applies without reload', () => {
    const { animate } = animated();
    const media = mockMatchMedia(false);
    const { state } = setup();
    state(start);
    media.set(true);
    state(afterMyMove);
    expect(animate).not.toHaveBeenCalled();
  });

  it('F14: no Element.animate (bare jsdom) — no errors, DOM is up to date', () => {
    const { state } = setup();
    state(start);
    state(afterMyMove);
    expect(screen.getByTestId('board-tile-0')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^hand-tile-/)).toHaveLength(6);
  });

  it('F15: second room:state during the flight finishes the first animation', () => {
    const { animations } = animated();
    const { state } = setup();
    state(start);
    state(afterMyMove);
    expect(animations[0]!.finish).not.toHaveBeenCalled();
    expect(animations[0]!.target).toHaveClass('is-flying');
    state(afterOpponentMove);
    expect(animations[0]!.finish).toHaveBeenCalledTimes(1);
    expect(animations[0]!.target).not.toHaveClass('is-flying');
    expect(animations).toHaveLength(2);
  });

  it('F16: first render (F5 / rejoin) — no animation and no sounds', () => {
    const { animate } = animated();
    const { state, sound } = setup();
    state(afterOpponentMove);
    expect(animate).not.toHaveBeenCalled();
    expect(sound.play).not.toHaveBeenCalled();
  });
});
