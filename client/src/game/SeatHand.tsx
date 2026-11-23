import type { ReactNode } from 'react';
import type { PlayerIndex, RoomPlayer, TurnTimerView } from '@domino/shared';
import { TurnTimer } from './TurnTimer';
import type { SeatSide } from './team';

export interface SeatHandProps {
  side: SeatSide;
  seat: PlayerIndex;
  player: RoomPlayer | undefined;
  count: number;
  /** Ход этого места — рамка-подсветка. */
  active: boolean;
  /** Подпись «(напарник)» у верхнего места. */
  partner?: boolean;
  /** spec-11: таймер, если он тикает на этом месте; иначе null. */
  timer: TurnTimerView | null;
  /** spec-12: облачко реакции этого места. */
  bubble?: ReactNode;
}

/**
 * spec-17 §4.3: чужое место за столом 2×2 — имя, рубашки по числу костей, метка «нет связи»,
 * таймер хода и облачко реакции. `data-seat` — источник полёта кости этого места.
 */
export function SeatHand({
  side,
  seat,
  player,
  count,
  active,
  partner = false,
  timer,
  bubble,
}: SeatHandProps) {
  return (
    <div
      className={`seat-hand seat-hand--${side}${active ? ' seat-hand--active' : ''}`}
      data-testid={`seat-${side}`}
      data-seat={seat}
      data-active={active ? 'true' : 'false'}
    >
      <p className="seat-hand-head">
        <span className="seat-name" data-testid="seat-name" title={player?.name}>
          {player?.name ?? ''}
        </span>
        {partner && <span className="seat-partner"> (напарник)</span>}
        {player && !player.connected && (
          <span className="seat-offline" data-testid="seat-offline">
            нет связи
          </span>
        )}
      </p>
      <div className="seat-tiles" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="tile-back" data-testid="seat-tile" />
        ))}
      </div>
      <span className="seat-count">
        × <span data-testid="seat-hand-count">{count}</span>
      </span>
      {timer && (
        <span className="seat-timer">
          <TurnTimer timer={timer} />
        </span>
      )}
      {bubble}
    </div>
  );
}
