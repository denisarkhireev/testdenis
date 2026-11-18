export interface OpponentHandProps {
  count: number;
}

/** Рука соперника рубашкой вверх + число костей. */
export function OpponentHand({ count }: OpponentHandProps) {
  return (
    <div className="opponent-hand" data-testid="opponent-hand">
      <div className="opponent-tiles">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="tile-back" data-testid="opponent-tile" />
        ))}
      </div>
      <span className="opponent-hand-label">
        У соперника: <span data-testid="opponent-hand-count">{count}</span>
      </span>
    </div>
  );
}
