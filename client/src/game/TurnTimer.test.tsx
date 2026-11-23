import { act, cleanup, render, screen } from '@testing-library/react';
import type { RoomStatePayload, TurnTimerView } from '@domino/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createFakeSocket, hello } from '../test/fakeSocket';
import { makeMatch, makeRoom, makeView } from '../test/fixtures';
import { MatchScore } from './MatchScore';
import { TurnTimer } from './TurnTimer';

const byId = (id: string) => screen.getByTestId(id);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const running = (remainingMs: number, seat: 0 | 1 = 0): TurnTimerView => ({
  seat,
  remainingMs,
  paused: false,
});

describe('TurnTimer (spec-11)', () => {
  it('TC3: counts down; the last 10 s are urgent', () => {
    vi.useFakeTimers();
    render(<TurnTimer timer={running(15_000)} />);
    const el = byId('turn-timer');
    expect(el).toHaveTextContent('00:15');
    expect(el).toHaveAttribute('data-urgent', 'false');
    expect(el).toHaveAttribute('data-paused', 'false');
    expect(el).toHaveAttribute('role', 'timer');
    expect(el).toHaveAttribute('aria-label', 'Осталось на ход: 00:15');
    act(() => vi.advanceTimersByTime(5_000));
    expect(el).toHaveTextContent('00:10');
    expect(el).toHaveAttribute('data-urgent', 'true');
    expect(el).toHaveClass('turn-timer--urgent');
  });

  it('TC4, UI8: paused → static «пауза 00:15» without ⏸', () => {
    vi.useFakeTimers();
    render(<TurnTimer timer={{ seat: 1, remainingMs: 15_000, paused: true }} />);
    const el = byId('turn-timer');
    expect(el.textContent).toBe('пауза 00:15');
    expect(el.textContent).not.toContain('⏸');
    expect(el).toHaveAttribute('aria-label', 'Таймер на паузе: 00:15');
    expect(el).toHaveClass('turn-timer--paused');
    act(() => vi.advanceTimersByTime(5_000));
    expect(el.textContent).toBe('пауза 00:15');
    expect(el).toHaveAttribute('data-paused', 'true');
    expect(el).toHaveAttribute('data-urgent', 'false');
    expect(el).toHaveAttribute('data-seat', '1');
  });

  it('TC5: null → nothing', () => {
    render(<TurnTimer timer={null} />);
    expect(screen.queryByTestId('turn-timer')).toBeNull();
  });

  it('TC7: a new remainingMs restarts the countdown from it at once', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TurnTimer timer={running(15_000)} />);
    act(() => vi.advanceTimersByTime(3_000));
    expect(byId('turn-timer')).toHaveTextContent('00:12');
    rerender(<TurnTimer timer={running(60_000, 1)} />);
    expect(byId('turn-timer')).toHaveTextContent('01:00');
    act(() => vi.advanceTimersByTime(1_000));
    expect(byId('turn-timer')).toHaveTextContent('00:59');
  });
});

function renderTable(overrides: Partial<RoomStatePayload>) {
  const { fake, socket } = createFakeSocket();
  render(<App socket={socket} />);
  fake.serverEmit('server:hello', hello());
  fake.serverEmit('room:state', makeRoom(makeView(), { turnSeconds: 60, ...overrides }));
  return fake;
}

describe('GameTable: turn timer placement (spec-11)', () => {
  it('TC6: my turn → exactly one timer, next to my hand', () => {
    renderTable({ turnTimer: running(42_000, 0) });
    expect(screen.getAllByTestId('turn-timer')).toHaveLength(1);
    const timer = byId('turn-timer');
    expect(timer.closest('.turn-timer-row--mine')).not.toBeNull();
    expect(timer).toHaveTextContent('00:42');
  });

  it("TC6: opponent's turn → exactly one timer, next to the opponent hand", () => {
    renderTable({ turnTimer: running(42_000, 1) });
    expect(screen.getAllByTestId('turn-timer')).toHaveLength(1);
    expect(byId('turn-timer').closest('.turn-timer-row--opponent')).not.toBeNull();
    expect(byId('turn-timer')).toHaveAttribute('data-seat', '1');
  });

  it('TC5: turnTimer null → no timer on the table', () => {
    renderTable({ turnSeconds: 0, turnTimer: null });
    expect(screen.queryByTestId('turn-timer')).toBeNull();
    expect(screen.queryByTestId('turn-seconds-label')).toBeNull();
  });
});

describe('MatchScore (spec-11, spec-13)', () => {
  it('TC8, UI7: shows «ход 60 с» (no « · » in the text) at 60 and nothing at 0', () => {
    const players = makeRoom().players;
    const { rerender } = render(
      <MatchScore match={makeMatch()} players={players} turnSeconds={60} />,
    );
    expect(byId('turn-seconds-label').textContent).toBe('ход 60 с');
    rerender(<MatchScore match={makeMatch()} players={players} turnSeconds={0} />);
    expect(screen.queryByTestId('turn-seconds-label')).toBeNull();
  });

  it('UI7: meta parts are separate .match-score-item, numbers stay in their testids', () => {
    const players = makeRoom().players;
    const match = makeMatch({ target: 101, roundNumber: 3 });
    const { container, rerender } = render(
      <MatchScore match={match} players={players} turnSeconds={30} />,
    );
    const items = () => [...container.querySelectorAll('.match-score-item')];
    expect(items().map((el) => el.textContent)).toEqual([
      'Классика',
      'до 101',
      'Раунд 3',
      'ход 30 с',
    ]);
    expect(byId('match-target').textContent).toBe('101');
    expect(byId('match-round').textContent).toBe('3');
    rerender(<MatchScore match={match} players={players} turnSeconds={0} />);
    expect(items()).toHaveLength(3);
  });
});
