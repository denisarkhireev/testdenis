import type { End, PlacedTile } from '@domino/shared';
import { TileFace } from './TileFace';

export interface BoardViewProps {
  board: readonly PlacedTile[];
  /** Режим выбора конца (G3): показать кнопки `end-left` / `end-right`. */
  choosingEnd: boolean;
  onChooseEnd: (end: End) => void;
}

/** T2–T3: цепочка слева направо с переносом по строкам. */
export function BoardView({ board, choosingEnd, onChooseEnd }: BoardViewProps) {
  return (
    <div className="board" data-testid="board">
      {board.length === 0 && (
        <p className="board-empty" data-testid="board-empty">
          Стол пуст — первый ход старшим дублем
        </p>
      )}
      {choosingEnd && (
        <button
          type="button"
          className="end-button"
          data-testid="end-left"
          onClick={() => onChooseEnd('left')}
        >
          ◀ сюда
        </button>
      )}
      {board.map((placed, i) => {
        const orientation = placed.left === placed.right ? 'vertical' : 'horizontal';
        return (
          <span
            key={i}
            className="board-tile"
            data-testid={`board-tile-${i}`}
            data-left={placed.left}
            data-right={placed.right}
            data-orientation={orientation}
          >
            <TileFace a={placed.left} b={placed.right} orientation={orientation} />
          </span>
        );
      })}
      {choosingEnd && (
        <button
          type="button"
          className="end-button"
          data-testid="end-right"
          onClick={() => onChooseEnd('right')}
        >
          сюда ▶
        </button>
      )}
    </div>
  );
}
