import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MatchView, PlayerView, RoundResult } from '@domino/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { MatchScore } from '../game/MatchScore';
import { RoundSummary } from '../game/RoundSummary';
import { createFakeSocket, hello } from '../test/fakeSocket';
import { makeMatch, makeRoom, makeView } from '../test/fixtures';
import { RoomSettingsLine } from './RoomSettingsLine';

const byId = (id: string) => screen.getByTestId(id);

const CLASSIC_HINT = 'Очки получает победитель раунда; выигрывает набравший цель.';
const KOZEL_HINT =
  'Очки записываются проигравшему раунда; кто первым наберёт цель — козёл и проиграл.';

function setup() {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  fake.serverEmit('server:hello', hello());
  fake.emitWithAck.mockReturnValue(new Promise(() => {}));
  return { fake };
}

function typeName(value: string) {
  fireEvent.change(byId('name-input'), { target: { value } });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('HomeScreen: rules variant (spec-16)', () => {
  it('KC-1: «Классика» by default; «Козёл» changes the hint, is sent and remembered', () => {
    const { fake } = setup();
    expect(byId('variant-choice')).toHaveAttribute('role', 'radiogroup');
    expect(byId('variant-choice-classic')).toBeChecked();
    expect(byId('variant-choice-kozel')).not.toBeChecked();
    expect(byId('variant-choice')).toHaveTextContent('Правила');
    expect(byId('variant-choice')).toHaveTextContent('Классика');
    expect(byId('variant-choice')).toHaveTextContent('Козёл');
    expect(byId('variant-hint')).toHaveTextContent(CLASSIC_HINT);

    fireEvent.click(byId('variant-choice-kozel'));
    expect(byId('variant-choice-kozel')).toBeChecked();
    expect(byId('variant-hint')).toHaveTextContent(KOZEL_HINT);

    typeName('Аня');
    fireEvent.click(byId('create-button'));
    expect(fake.emitWithAck).toHaveBeenCalledExactlyOnceWith('room:create', {
      name: 'Аня',
      matchTarget: 101,
      handSize: 7,
      turnSeconds: 60,
      variant: 'kozel',
    });
    expect(localStorage.getItem('domino:variant')).toBe('kozel');
  });

  it('KC-1: «Играть с ботом» sends the variant too', () => {
    const { fake } = setup();
    fireEvent.click(byId('variant-choice-kozel'));
    typeName('Аня');
    fireEvent.click(byId('bot-button'));
    expect(fake.emitWithAck).toHaveBeenCalledWith(
      'room:create',
      expect.objectContaining({ variant: 'kozel', opponent: 'bot' }),
    );
  });

  it("KC-2: saved 'kozel' is restored; garbage in storage → «Классика»", () => {
    localStorage.setItem('domino:variant', 'kozel');
    setup();
    expect(byId('variant-choice-kozel')).toBeChecked();
    cleanup();
    localStorage.setItem('domino:variant', 'x');
    setup();
    expect(byId('variant-choice-classic')).toBeChecked();
  });

  it('KC-2: throwing localStorage → «Классика», no errors', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    setup();
    expect(byId('variant-choice-classic')).toBeChecked();
  });
});

describe('variant on the settings line and the scoreboard (spec-16)', () => {
  it('KC-3: RoomSettingsLine shows «Козёл · Матч до 101 · …»', () => {
    render(
      <RoomSettingsLine
        testId="join-settings"
        settings={{ matchTarget: 101, handSize: 7, turnSeconds: 60, variant: 'kozel' }}
      />,
    );
    expect(byId('join-settings-variant')).toHaveTextContent('Козёл');
    expect(byId('join-settings')).toHaveTextContent(
      'Козёл · Матч до 101 · 7 костей в руке · ход 60 с',
    );
  });

  it('KC-3: without variant (old server) → «Классика»', () => {
    render(
      <RoomSettingsLine testId="w" settings={{ matchTarget: 51, handSize: 5, turnSeconds: 0 }} />,
    );
    expect(byId('w-variant')).toHaveTextContent('Классика');
  });

  it('KC-4: MatchScore variant-label — «Козёл» / «Классика» by default', () => {
    const players = makeRoom().players;
    const { rerender } = render(<MatchScore match={makeMatch()} players={players} />);
    expect(byId('variant-label')).toHaveTextContent('Классика');
    rerender(<MatchScore match={makeMatch()} players={players} variant="kozel" />);
    expect(byId('variant-label')).toHaveTextContent('Козёл');
  });

  it('KC-4: the game table shows the room variant', async () => {
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.serverEmit('server:hello', hello());
    fake.serverEmit('room:state', makeRoom(makeView(), { variant: 'kozel' }));
    await act(async () => {});
    expect(byId('variant-label')).toHaveTextContent('Козёл');
  });
});

/** Итоги у `you = 0` (Аня), соперник — Боб. */
function summary(result: RoundResult, match: MatchView = makeMatch(), variant?: 'kozel') {
  const game: PlayerView = makeView({
    status: 'finished',
    hand: [[2, 5]],
    opponentHand: [],
    opponentHandCount: 0,
    legalMoves: [],
    result,
  });
  return render(
    <RoundSummary
      game={game}
      result={result}
      match={match}
      players={makeRoom().players}
      error={null}
      canContinue
      onContinue={() => {}}
      {...(variant ? { variant } : {})}
    />,
  );
}

describe('RoundSummary in «Козёл» (spec-16)', () => {
  it('KC-5: opponent went out → «Очки записаны вам: +13 (домино)»', () => {
    summary(
      { reason: 'domino', winner: 1, scorer: 0, points: 13, handPoints: [13, 0] },
      makeMatch(),
      'kozel',
    );
    expect(byId('round-finished')).toHaveTextContent('Очки записаны вам: +13 (домино)');
    expect(byId('round-points')).toHaveTextContent('13');
  });

  it('KC-5: you went out → «Очки записаны: Боб +13 (домино)»', () => {
    summary(
      { reason: 'domino', winner: 0, scorer: 1, points: 13, handPoints: [0, 13] },
      makeMatch(),
      'kozel',
    );
    expect(byId('round-finished')).toHaveTextContent('Очки записаны: Боб +13 (домино)');
  });

  it('KC-5: fish → «(рыба)»; equal fish → «Рыба — ничья, очков никому»', () => {
    const { unmount } = summary(
      { reason: 'fish', winner: 0, scorer: 1, points: 9, handPoints: [4, 9] },
      makeMatch(),
      'kozel',
    );
    expect(byId('round-finished')).toHaveTextContent('Очки записаны: Боб +9 (рыба)');
    unmount();
    summary(
      { reason: 'fish', winner: null, scorer: null, points: 0, handPoints: [7, 7] },
      makeMatch(),
      'kozel',
    );
    expect(byId('round-finished')).toHaveTextContent('Рыба — ничья, очков никому');
  });

  it('KC-6: match over, you are the goat → «Вы — козёл! Матч выиграл Боб · Счёт …»', () => {
    summary(
      { reason: 'domino', winner: 1, scorer: 0, points: 13, handPoints: [13, 0] },
      makeMatch({ scores: [104, 40], winner: 1 }),
      'kozel',
    );
    expect(byId('match-finished')).toHaveTextContent(
      'Вы — козёл! Матч выиграл Боб · Счёт 104 : 40',
    );
    expect(byId('continue-button')).toHaveTextContent('Реванш');
  });

  it('KC-6: match over, the opponent is the goat → «Вы выиграли матч! Боб — козёл · Счёт …»', () => {
    summary(
      { reason: 'domino', winner: 0, scorer: 1, points: 13, handPoints: [0, 13] },
      makeMatch({ scores: [20, 101], winner: 0 }),
      'kozel',
    );
    expect(byId('match-finished')).toHaveTextContent(
      'Вы выиграли матч! Боб — козёл · Счёт 20 : 101',
    );
  });

  it('KC-7: without variant — classic texts', () => {
    summary(
      { reason: 'domino', winner: 0, points: 13, handPoints: [0, 13] },
      makeMatch({ scores: [101, 0], winner: 0 }),
    );
    expect(byId('round-finished')).toHaveTextContent('Вы выиграли раунд: +13 (домино)');
    expect(byId('match-finished')).toHaveTextContent('Вы выиграли матч! · Счёт 101 : 0');
  });
});
