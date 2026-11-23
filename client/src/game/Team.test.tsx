import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MatchView, PlayerView, RoomStatePayload, RoundResult } from '@domino/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { diffTable } from '../fx/diffTable';
import { RoomSettingsLine } from '../lobby/RoomSettingsLine';
import { createFakeSocket, hello } from '../test/fakeSocket';
import { makeMatch, makeTeamRoom, makeTeamView, makeView } from '../test/fixtures';
import { MatchScore } from './MatchScore';

const byId = (id: string) => screen.getByTestId(id);
const queryById = (id: string) => screen.queryByTestId(id);

async function flush() {
  await act(async () => {});
}

function setupApp() {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  fake.serverEmit('server:hello', hello());
  return { fake };
}

/** App + hello + room:state 2×2. */
function setupTable(room: RoomStatePayload = makeTeamRoom()) {
  const { fake } = setupApp();
  fake.serverEmit('room:state', room);
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('лобби 2×2 (spec-17)', () => {
  it('C-Q1: «2 на 2» — рука 7 и недоступна, бот недоступен, подсказка; create без handSize', () => {
    const { fake } = setupApp();
    fake.emitWithAck.mockReturnValue(new Promise(() => {}));
    expect(byId('mode-choice')).toHaveTextContent('Игроки');
    expect(byId('mode-choice-1x1')).toBeChecked();
    expect(queryById('mode-hint')).toBeNull();
    fireEvent.click(byId('hand-size-choice-5'));

    fireEvent.click(byId('mode-choice-2x2'));
    expect(byId('mode-choice-2x2')).toBeChecked();
    expect(byId('hand-size-choice')).toBeDisabled();
    expect(byId('hand-size-choice-7')).toBeChecked();
    expect(byId('mode-hint')).toHaveTextContent(
      '2 на 2: напарник напротив, по 7 костей, базара нет',
    );
    typeName('Аня');
    expect(byId('bot-button')).toBeDisabled();
    expect(byId('create-button')).toBeEnabled();
    fireEvent.click(byId('create-button'));
    expect(fake.emitWithAck).toHaveBeenCalledExactlyOnceWith('room:create', {
      name: 'Аня',
      matchTarget: 101,
      turnSeconds: 60,
      variant: 'classic',
      mode: '2x2',
    });
    expect(localStorage.getItem('domino:mode')).toBe('2x2');
    // размер руки для 1×1 остаётся прежним выбором
    expect(localStorage.getItem('domino:handSize')).toBeNull();
  });

  it('C-Q1: сохранённый режим выбирается при следующем открытии', () => {
    localStorage.setItem('domino:mode', '2x2');
    setupApp();
    expect(byId('mode-choice-2x2')).toBeChecked();
  });

  it('C-Q2: WaitingScreen 2×2 — «Ожидаем игроков: 2/4», места с командами, «(вы)»', () => {
    const room = makeTeamRoom(null, {
      phase: 'waiting',
      match: null,
      you: 2,
      players: [
        { seat: 0, name: 'Аня', connected: true, reconnectRemainingMs: null, bot: false },
        { seat: 2, name: 'Вера', connected: true, reconnectRemainingMs: null, bot: false },
      ],
    });
    setupTable(room);
    expect(byId('waiting-count')).toHaveTextContent('Ожидаем игроков: 2/4');
    expect(byId('waiting-seat-0')).toHaveTextContent('Место 1 · Команда 1: Аня');
    expect(byId('waiting-seat-1')).toHaveTextContent('Место 2 · Команда 2: свободно');
    expect(byId('waiting-seat-2')).toHaveTextContent('Место 3 · Команда 1: Вера (вы)');
    expect(byId('waiting-seat-3')).toHaveTextContent('Место 4 · Команда 2: свободно');
    expect(byId('waiting-settings')).toHaveTextContent('2 на 2 · Классика');
    expect(byId('invite-link')).toBeInTheDocument();
  });

  it('C-Q3: JoinScreen 2×2 — «Свободно мест: 1 из 4»; ROOM_FULL → «Все четыре места уже заняты»', async () => {
    window.history.replaceState(null, '', '/?room=ABC234');
    const { fake, socket } = createFakeSocket();
    render(<App socket={socket} />);
    fake.infoAck.mockResolvedValueOnce({
      ok: true,
      roomId: 'ABC234',
      settings: { matchTarget: 101, handSize: 7, turnSeconds: 60, variant: 'classic', mode: '2x2' },
      freeSeats: 1,
    });
    fake.serverEmit('server:hello', hello());
    await flush();
    expect(byId('join-free-seats')).toHaveTextContent('Свободно мест: 1 из 4');
    expect(byId('join-settings')).toHaveTextContent('2 на 2');
    typeName('Гена');
    fake.emitWithAck.mockResolvedValueOnce({ ok: false, error: 'ROOM_FULL' });
    fireEvent.click(byId('join-button'));
    await flush();
    expect(byId('form-error')).toHaveTextContent('Все четыре места уже заняты');
  });

  it('C-Q3: 1×1 — свободные места не показываются, текст ROOM_FULL прежний', () => {
    render(
      <RoomSettingsLine
        testId="s"
        settings={{ matchTarget: 101, handSize: 7, turnSeconds: 0, mode: '1x1' }}
      />,
    );
    expect(byId('s')).toHaveTextContent('Классика · Матч до 101');
    expect(queryById('s-mode')).toBeNull();
  });
});

describe('стол 2×2 (spec-17)', () => {
  it('C-Q4: you = 1 — сверху место 3, слева 2, справа 0; рубашки = handCounts; нет базара', () => {
    const view = makeTeamView({
      you: 1,
      currentPlayer: 2,
      handCounts: [5, 6, 4, 7],
      hand: [
        [0, 1],
        [1, 2],
        [2, 4],
        [3, 5],
        [0, 0],
        [1, 5],
      ],
      legalMoves: [],
      board: [{ tile: [6, 6], left: 6, right: 6 }],
    });
    setupTable(makeTeamRoom(view, { you: 1 }));
    const top = byId('seat-top');
    const left = byId('seat-left');
    const right = byId('seat-right');
    expect(top).toHaveAttribute('data-seat', '3');
    expect(left).toHaveAttribute('data-seat', '2');
    expect(right).toHaveAttribute('data-seat', '0');
    expect(within(top).getByTestId('seat-name')).toHaveTextContent('Гена');
    expect(top).toHaveTextContent('(напарник)');
    expect(within(top).getByTestId('seat-hand-count')).toHaveTextContent('7');
    expect(within(top).getAllByTestId('seat-tile')).toHaveLength(7);
    expect(within(left).getAllByTestId('seat-tile')).toHaveLength(4);
    expect(within(right).getAllByTestId('seat-tile')).toHaveLength(5);
    expect(left).toHaveAttribute('data-active', 'true');
    expect(top).toHaveAttribute('data-active', 'false');
    expect(screen.getAllByTestId(/^hand-tile-/)).toHaveLength(6);
    expect(queryById('boneyard')).toBeNull();
    expect(queryById('draw-button')).toBeNull();
    expect(queryById('opponent-hand')).toBeNull();
    expect(byId('pass-button')).toBeInTheDocument();
  });

  it('C-Q4: отключённое место — метка «нет связи» и плашка с именем', () => {
    const room = makeTeamRoom();
    room.players[3] = { ...room.players[3]!, connected: false, reconnectRemainingMs: 60_000 };
    setupTable(room);
    expect(within(byId('seat-right')).getByTestId('seat-offline')).toHaveTextContent('нет связи');
    expect(byId('opponent-offline')).toHaveTextContent('Гена отключился, ждём…');
  });

  it('C-Q5: индикатор — «Ваш ход» / «Ход напарника: Вера» / «Ход: Боб»', () => {
    const { fake } = setupTable();
    expect(byId('turn-indicator')).toHaveTextContent('Ваш ход');
    expect(byId('turn-indicator')).toHaveAttribute('data-my-turn', 'true');
    fake.serverEmit('room:state', makeTeamRoom(makeTeamView({ currentPlayer: 2, legalMoves: [] })));
    expect(byId('turn-indicator')).toHaveTextContent('Ход напарника: Вера');
    expect(byId('turn-indicator')).toHaveAttribute('data-my-turn', 'false');
    fake.serverEmit('room:state', makeTeamRoom(makeTeamView({ currentPlayer: 1, legalMoves: [] })));
    expect(byId('turn-indicator')).toHaveTextContent('Ход: Боб');
  });

  it('C-Q6: MatchScore 2×2 — «Аня и Вера 34 : 12 Боб и Гена», без «по h костей»', () => {
    const players = makeTeamRoom().players;
    render(
      <MatchScore
        match={makeMatch({ scores: [34, 12], ready: [false, false, false, false] })}
        players={players}
        handSize={7}
        mode="2x2"
      />,
    );
    expect(byId('match-score')).toHaveTextContent('Аня и Вера 34 : 12 Боб и Гена');
    expect(byId('match-score-0')).toHaveTextContent('34');
    expect(byId('match-score-1')).toHaveTextContent('12');
    expect(queryById('hand-size-label')).toBeNull();
  });
});

function finishedRoom(
  result: RoundResult,
  match: Partial<MatchView> = {},
  overrides: Partial<RoomStatePayload> = {},
  you: 0 | 1 | 2 | 3 = 0,
): RoomStatePayload {
  const hands: PlayerView['hands'] = [[[2, 3]], [[4, 5]], [], [[0, 4]]];
  const view = makeTeamView({
    you,
    status: 'finished',
    result,
    hand: hands[you]!,
    hands,
    handCounts: [1, 1, 0, 1],
    legalMoves: [],
  });
  return makeTeamRoom(view, {
    you,
    phase: 'finished',
    match: makeMatch({ ready: [false, false, false, false], ...match }),
    ...overrides,
  });
}

const DOMINO: RoundResult = {
  reason: 'domino',
  winner: 0,
  points: 13,
  handPoints: [5, 9, 0, 4],
  teamPoints: [5, 13],
  dominoSeat: 2,
};

describe('итоги 2×2 (spec-17)', () => {
  it('C-Q7: классика — заголовки по командам, 4 руки, суммы команд, готовность K/4', () => {
    const { fake } = setupTable(finishedRoom(DOMINO, { scores: [13, 0] }));
    expect(byId('round-finished')).toHaveTextContent('Ваша команда выиграла раунд: +13 (домино)');
    for (const seat of [0, 1, 2, 3]) expect(byId(`summary-hand-${seat}`)).toBeInTheDocument();
    expect(byId('summary-hand-points-1')).toHaveTextContent('9');
    expect(byId('summary-team-points-0')).toHaveTextContent('5');
    expect(byId('summary-team-points-1')).toHaveTextContent('13');
    expect(byId('ready-status')).toHaveTextContent('');

    fake.serverEmit(
      'room:state',
      finishedRoom(DOMINO, { ready: [false, true, true, false] }, {}, 1),
    );
    expect(byId('round-finished')).toHaveTextContent(
      'Раунд выиграла команда Аня и Вера: +13 (домино)',
    );
    expect(byId('ready-status')).toHaveTextContent('Ждём остальных: 2/4');
    fake.serverEmit(
      'room:state',
      finishedRoom(DOMINO, { ready: [false, true, true, true] }, {}, 0),
    );
    expect(byId('ready-status')).toHaveTextContent('Готовы: 3/4');

    fake.serverEmit(
      'room:state',
      finishedRoom({
        reason: 'fish',
        winner: null,
        points: 0,
        handPoints: [4, 5, 6, 5],
        teamPoints: [10, 10],
      }),
    );
    expect(byId('round-finished')).toHaveTextContent('Рыба — ничья');
  });

  it('C-Q7: итог матча — «Ваша команда выиграла матч!» / «Матч выиграла команда …»', () => {
    const { fake } = setupTable(finishedRoom(DOMINO, { scores: [101, 40], winner: 0 }));
    expect(byId('match-finished')).toHaveTextContent('Ваша команда выиграла матч! · Счёт 101 : 40');
    expect(byId('continue-button')).toHaveTextContent('Реванш');
    fake.serverEmit('room:state', finishedRoom(DOMINO, { scores: [101, 40], winner: 0 }, {}, 3));
    expect(byId('match-finished')).toHaveTextContent('Матч выиграла команда Аня и Вера');
  });

  it('C-Q7: «Козёл» — кому записаны очки и кто козлы', () => {
    const kozel: RoundResult = {
      reason: 'domino',
      winner: 1,
      scorer: 0,
      points: 14,
      handPoints: [6, 0, 8, 3],
      teamPoints: [14, 3],
      dominoSeat: 1,
    };
    const { fake } = setupTable(finishedRoom(kozel, {}, { variant: 'kozel' }));
    expect(byId('round-finished')).toHaveTextContent('Очки записаны вашей команде: +14 (домино)');
    fake.serverEmit('room:state', finishedRoom(kozel, {}, { variant: 'kozel' }, 1));
    expect(byId('round-finished')).toHaveTextContent(
      'Очки записаны команде Аня и Вера: +14 (домино)',
    );
    fake.serverEmit(
      'room:state',
      finishedRoom(
        { ...kozel, reason: 'fish', winner: null, scorer: null, points: 0 },
        {},
        { variant: 'kozel' },
      ),
    );
    expect(byId('round-finished')).toHaveTextContent('Рыба — ничья, очков никому');
    fake.serverEmit(
      'room:state',
      finishedRoom(kozel, { scores: [104, 30], winner: 1 }, { variant: 'kozel' }),
    );
    expect(byId('match-finished')).toHaveTextContent(
      'Ваша команда — козлы! Матч выиграла команда Боб и Гена',
    );
    fake.serverEmit(
      'room:state',
      finishedRoom(kozel, { scores: [104, 30], winner: 1 }, { variant: 'kozel' }, 1),
    );
    expect(byId('match-finished')).toHaveTextContent('Вы выиграли матч! Аня и Вера — козлы');
  });

  it('C-Q8: ForfeitSummary 2×2 — победа / сам не вернулся / напарник не вернулся', () => {
    const forfeit = (you: 0 | 1 | 2 | 3) =>
      makeTeamRoom(makeTeamView({ you }), {
        you,
        phase: 'finished',
        match: makeMatch({
          winner: 0,
          forfeit: 1,
          forfeitSeat: 3,
          ready: [false, false, false, false],
        }),
      });
    const { fake } = setupTable(forfeit(0));
    expect(byId('forfeit-result')).toHaveTextContent(
      'Победа! Игрок команды соперников не вернулся в игру',
    );
    expect(byId('match-score')).toHaveTextContent('Аня и Вера 0 : 0 Боб и Гена');
    fake.serverEmit('room:state', forfeit(3));
    expect(byId('forfeit-result')).toHaveTextContent('Поражение: время на возвращение истекло');
    fake.serverEmit('room:state', forfeit(1));
    expect(byId('forfeit-result')).toHaveTextContent('Поражение: напарник не вернулся в игру');
  });
});

describe('реакции, таймер и события 2×2 (spec-17)', () => {
  it('C-Q9: room:reaction { seat: 3 } → облачко внутри [data-seat="3"]', () => {
    const { fake } = setupTable();
    fake.serverEmit('room:reaction', { seat: 3, reactionId: 'thumbs_up', seq: 1 });
    const seat3 = document.querySelector('[data-seat="3"]') as HTMLElement;
    expect(within(seat3).getByTestId('reaction-bubble-opponent')).toBeInTheDocument();
    expect(
      within(byId('seat-top')).queryByTestId('reaction-bubble-opponent'),
    ).not.toBeInTheDocument();
    fake.serverEmit('room:reaction', { seat: 0, reactionId: 'laugh', seq: 2 });
    expect(byId('reaction-bubble-mine')).toHaveAttribute('data-reaction-id', 'laugh');
  });

  it('C-Q11: таймер места 2 — в его SeatHand; свой — снизу', () => {
    const { fake } = setupTable(
      makeTeamRoom(makeTeamView({ currentPlayer: 2, legalMoves: [] }), {
        turnSeconds: 30,
        turnTimer: { seat: 2, remainingMs: 20_000, paused: false },
      }),
    );
    expect(within(byId('seat-top')).getByTestId('turn-timer')).toHaveAttribute('data-seat', '2');
    expect(screen.getAllByTestId('turn-timer')).toHaveLength(1);
    fake.serverEmit(
      'room:state',
      makeTeamRoom(makeTeamView(), {
        turnSeconds: 30,
        turnTimer: { seat: 0, remainingMs: 30_000, paused: false },
      }),
    );
    const timer = byId('turn-timer');
    expect(timer.closest('.seat-hand')).toBeNull();
    expect(timer.closest('.turn-timer-row--mine')).not.toBeNull();
  });

  it('C-Q10: diffTable по handCounts — play места 2 с seat; свой ход — who me', () => {
    const board = [{ tile: [6, 6] as const, left: 6 as const, right: 6 as const }];
    const prev = makeTeamView({
      currentPlayer: 2,
      legalMoves: [],
      board,
      handCounts: [6, 7, 7, 7],
    });
    const next = makeTeamView({
      currentPlayer: 3,
      legalMoves: [],
      board: [...board, { tile: [5, 6], left: 6, right: 5 }],
      handCounts: [6, 7, 6, 7],
    });
    expect(diffTable(prev, next)).toEqual([
      { type: 'play', who: 'opponent', seat: 2, tile: [6, 5], end: 'right', boardIndex: 1 },
    ]);
    const mine = makeTeamView({
      hand: [[0, 1]],
      board: [...board, { tile: [5, 6], left: 6, right: 5 }],
      handCounts: [1, 7, 7, 7],
      currentPlayer: 1,
      legalMoves: [],
    });
    const before = makeTeamView({
      hand: [
        [0, 1],
        [5, 6],
      ],
      board,
      handCounts: [2, 7, 7, 7],
    });
    expect(diffTable(before, mine)).toEqual([
      { type: 'play', who: 'me', tile: [6, 5], end: 'right', boardIndex: 1 },
    ]);
    // ход перешёл ко мне от места 3
    const toMe = makeTeamView({ currentPlayer: 0, board, handCounts: [7, 7, 7, 7] });
    const from3 = makeTeamView({
      currentPlayer: 3,
      legalMoves: [],
      board,
      handCounts: [7, 7, 7, 7],
    });
    expect(diffTable(from3, toMe)).toEqual([{ type: 'turn' }]);
    // 1×1 — прежние события без seat
    const p1 = makeView({ opponentHandCount: 7, currentPlayer: 1, legalMoves: [], board });
    const n1 = makeView({
      opponentHandCount: 6,
      currentPlayer: 0,
      board: [...board, { tile: [5, 6], left: 6, right: 5 }],
    });
    expect(diffTable(p1, n1)[0]).toEqual({
      type: 'play',
      who: 'opponent',
      tile: [6, 5],
      end: 'right',
      boardIndex: 1,
    });
  });
});
