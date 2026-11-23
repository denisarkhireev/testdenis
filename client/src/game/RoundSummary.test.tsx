import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MatchView, PlayerView, RoomStatePayload, RoundResult } from '@domino/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { TIMEOUT_TEXT } from '../lobby/errors';
import { createFakeSocket, deferred, hello } from '../test/fakeSocket';
import { makeMatch, makeRoom, makeView } from '../test/fixtures';
import { GAME_ERROR_TEXT } from './errors';
import { RoundSummary } from './RoundSummary';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);

/** Конец раунда у `you = 0`: своя рука [2,5] [6,6], соперник вышел (или нет). */
function finishedView(result: RoundResult, partial: Partial<PlayerView> = {}): PlayerView {
  return makeView({
    status: 'finished',
    hand: [
      [2, 5],
      [6, 6],
    ],
    opponentHandCount: 1,
    opponentHand: [[1, 2]],
    board: [{ tile: [3, 6], left: 3, right: 6 }],
    boneyardCount: 3,
    currentPlayer: 1,
    legalMoves: [],
    result,
    ...partial,
  });
}

const youWinDomino: RoundResult = {
  reason: 'domino',
  winner: 0,
  points: 19,
  handPoints: [0, 19],
};

function setup(
  view: PlayerView,
  match: MatchView = makeMatch(),
  extra: Partial<RoomStatePayload> = {},
) {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  fake.serverEmit('server:hello', hello());
  fake.serverEmit('room:state', makeRoom(view, { match, ...extra }));
  return { fake };
}

function readyCalls(fake: ReturnType<typeof createFakeSocket>['fake']) {
  return fake.emitWithAck.mock.calls.filter(([event]) => event === 'game:ready');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('MatchScore / RoundSummary', () => {
  it('S1: during the round — the match score is shown, no summary', () => {
    setup(makeView());
    expect(byId('match-score')).toHaveTextContent('Аня 0 : 0 Боб');
    expect(byId('match-score-0')).toHaveTextContent(/^0$/);
    expect(byId('match-score-1')).toHaveTextContent(/^0$/);
    expect(byId('match-target')).toHaveTextContent(/^101$/);
    expect(byId('match-round')).toHaveTextContent(/^1$/);
    expect(queryById('round-summary')).toBeNull();
    expect(byId('turn-indicator')).toBeInTheDocument();
  });

  it('S2: I won by domino — title, both hands face up, hand points, active button', () => {
    const won = finishedView(
      { reason: 'domino', winner: 0, points: 3, handPoints: [0, 3] },
      { hand: [], opponentHand: [[1, 2]] },
    );
    setup(won, makeMatch({ scores: [3, 0], rounds: [won.result!] }));
    expect(byId('round-finished')).toHaveTextContent(/^Вы выиграли раунд: \+3 \(домино\)$/);
    expect(byId('round-points')).toHaveTextContent(/^3$/);
    expect(byId('summary-hand-0')).toHaveTextContent('Аня: 0 очк.');
    expect(byId('summary-hand-0')).toHaveTextContent('пусто');
    expect(byId('summary-hand-points-1')).toHaveTextContent(/^3$/);
    expect(
      within(byId('summary-hand-1'))
        .getAllByRole('img')
        .map((t) => t.ariaLabel),
    ).toEqual(['1-2']);
    expect(byId('continue-button')).toHaveTextContent('Следующий раунд');
    expect(byId('continue-button')).toBeEnabled();
    expect(byId('ready-status')).toHaveTextContent(/^$/);
    expect(byId('match-score')).toHaveTextContent('Аня 3 : 0 Боб');
    expect(queryById('turn-indicator')).toBeNull();
    expect(queryById('draw-button')).toBeNull();
    expect(queryById('match-finished')).toBeNull();
    expect(byId('board-tile-0')).toBeInTheDocument();
  });

  it('S2: my own hand is shown face up in seat order', () => {
    setup(
      finishedView(
        { reason: 'domino', winner: 1, points: 19, handPoints: [19, 0] },
        { opponentHand: [] },
      ),
    );
    const mine = within(byId('summary-hand-0')).getAllByRole('img');
    expect(mine.map((t) => t.ariaLabel)).toEqual(['2-5', '6-6']);
    expect(byId('summary-hand-points-0')).toHaveTextContent(/^19$/);
    expect(byId('summary-hand-1')).toHaveTextContent('Боб: 0 очк.');
    expect(byId('summary-hand-1')).toHaveTextContent('пусто');
  });

  it('S3: the opponent won by fish', () => {
    setup(finishedView({ reason: 'fish', winner: 1, points: 7, handPoints: [7, 3] }));
    expect(byId('round-finished')).toHaveTextContent(/^Раунд выиграл Боб: \+7 \(рыба\)$/);
    expect(byId('round-points')).toHaveTextContent(/^7$/);
  });

  it('S4: a draw', () => {
    setup(finishedView({ reason: 'fish', winner: null, points: 0, handPoints: [7, 7] }));
    expect(byId('round-finished')).toHaveTextContent(/^Рыба — ничья$/);
    expect(byId('round-points')).toHaveTextContent(/^0$/);
  });

  it('S5: continue sends game:ready {} once, even on a double click', async () => {
    const { fake } = setup(finishedView(youWinDomino));
    const ack = deferred<unknown>();
    fake.emitWithAck.mockReturnValueOnce(ack.promise);
    fireEvent.click(byId('continue-button'));
    fireEvent.click(byId('continue-button'));
    expect(readyCalls(fake)).toEqual([['game:ready', {}]]);
    expect(byId('continue-button')).toBeDisabled();
    await act(async () => ack.resolve({ ok: true }));
    expect(readyCalls(fake)).toHaveLength(1);
  });

  it('S6: I am ready — button disabled, waiting for the opponent', () => {
    setup(finishedView(youWinDomino), makeMatch({ ready: [true, false] }));
    expect(byId('continue-button')).toBeDisabled();
    expect(byId('ready-status')).toHaveTextContent(/^Ждём соперника…$/);
  });

  it('S7: the opponent is ready, I am not', () => {
    setup(finishedView(youWinDomino), makeMatch({ ready: [false, true] }));
    expect(byId('continue-button')).toBeEnabled();
    expect(byId('ready-status')).toHaveTextContent(/^Соперник готов$/);
  });

  it('S8: the match is over — winner and rematch button', () => {
    setup(finishedView(youWinDomino), makeMatch({ scores: [104, 40], winner: 0, roundNumber: 5 }));
    expect(byId('match-finished')).toHaveTextContent('Вы выиграли матч!');
    expect(byId('match-finished')).toHaveTextContent('104 : 40');
    expect(byId('continue-button')).toHaveTextContent(/^Реванш$/);
    cleanup();
    setup(finishedView(youWinDomino), makeMatch({ scores: [40, 101], winner: 1 }));
    expect(byId('match-finished')).toHaveTextContent('Матч выиграл Боб');
  });

  it('UI1: match result line has exactly one « · » before the score', () => {
    setup(finishedView(youWinDomino), makeMatch({ scores: [104, 40], winner: 0, roundNumber: 5 }));
    expect(byId('match-finished').textContent).toBe('Вы выиграли матч! · Счёт 104 : 40');
    cleanup();
    setup(finishedView(youWinDomino), makeMatch({ scores: [4, 42], winner: 1 }));
    expect(byId('match-finished').textContent).toBe('Матч выиграл Боб · Счёт 4 : 42');
  });

  it('S9: an error ack and a timeout are shown in move-error', async () => {
    const { fake } = setup(finishedView(youWinDomino));
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'ROUND_NOT_FINISHED' });
    await act(async () => fireEvent.click(byId('continue-button')));
    expect(byId('move-error')).toHaveTextContent(GAME_ERROR_TEXT.ROUND_NOT_FINISHED);

    fake.emitWithAck.mockRejectedValueOnce(new Error('timeout'));
    await act(async () => fireEvent.click(byId('continue-button')));
    expect(byId('move-error')).toHaveTextContent(TIMEOUT_TEXT);
  });

  it('S10: a new playing room:state hides the summary and the table is interactive', () => {
    const { fake } = setup(finishedView(youWinDomino), makeMatch({ ready: [true, false] }));
    fake.serverEmit(
      'room:state',
      makeRoom(makeView(), { match: makeMatch({ scores: [19, 0], roundNumber: 2 }) }),
    );
    expect(queryById('round-summary')).toBeNull();
    expect(byId('match-round')).toHaveTextContent(/^2$/);
    expect(byId('match-score-0')).toHaveTextContent(/^19$/);
    expect(byId('turn-indicator')).toHaveTextContent('Ваш ход');
    expect(byId('hand-tile-6-6')).toBeEnabled();
  });

  it('S11: no connection — continue is disabled', () => {
    const { fake } = setup(finishedView(youWinDomino));
    fake.serverEmit('disconnect', 'transport close');
    expect(byId('continue-button')).toBeDisabled();
    fireEvent.click(byId('continue-button'));
    expect(readyCalls(fake)).toHaveLength(0);
  });
});

describe('RoundSummary reaction bubbles (spec-13 UI9)', () => {
  it('UI9: opponentBubble is inside the opponent hand, mineBubble inside mine', () => {
    for (const you of [0, 1] as const) {
      const game = finishedView(youWinDomino, { you });
      const opponent = you === 0 ? 1 : 0;
      render(
        <RoundSummary
          game={game}
          result={youWinDomino}
          match={makeMatch()}
          players={makeRoom(game).players}
          error={null}
          canContinue
          onContinue={() => {}}
          opponentBubble={<span data-testid="opp-bubble" />}
          mineBubble={<span data-testid="mine-bubble" />}
        />,
      );
      expect(byId(`summary-hand-${opponent}`)).toContainElement(byId('opp-bubble'));
      expect(byId(`summary-hand-${you}`)).toContainElement(byId('mine-bubble'));
      cleanup();
    }
  });
});
