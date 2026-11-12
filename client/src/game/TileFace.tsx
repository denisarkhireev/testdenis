import type { Pip } from '@domino/shared';

export type TileOrientation = 'vertical' | 'horizontal';

/**
 * Ячейки сетки 3×3 (0 — левый верхний, 8 — правый нижний) с точкой, как на настоящей кости.
 * У горизонтальной кости «шестёрка» лежит рядами, у вертикальной — столбцами.
 */
const PIP_CELLS: Record<TileOrientation, Record<Pip, readonly number[]>> = {
  vertical: {
    0: [],
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  },
  horizontal: {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 1, 2, 6, 7, 8],
  },
};

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function Half({ value, orientation }: { value: Pip; orientation: TileOrientation }) {
  const pips = PIP_CELLS[orientation][value];
  return (
    <span className="tile-half" data-value={value}>
      {CELLS.map((cell) => (
        <span key={cell} className={pips.includes(cell) ? 'pip' : 'pip-slot'} />
      ))}
    </span>
  );
}

export interface TileFaceProps {
  a: Pip;
  b: Pip;
  orientation: TileOrientation;
}

/** T1: `a` — верхняя (вертикально) или левая (горизонтально) половина. */
export function TileFace({ a, b, orientation }: TileFaceProps) {
  return (
    <span className={`tile tile--${orientation}`} role="img" aria-label={`${a}-${b}`}>
      <Half value={a} orientation={orientation} />
      <span className="tile-divider" />
      <Half value={b} orientation={orientation} />
    </span>
  );
}
