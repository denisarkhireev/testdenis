import { sameTile, tileKey, type Move, type Tile } from '@domino/shared';
import { isPlayable, tileTestId } from './moves';
import { TileFace } from './TileFace';

export interface HandViewProps {
  hand: readonly Tile[];
  legalMoves: readonly Move[];
  /** false — не свой ход / конец раунда / ждём ответа / нет связи: рука «спокойная». */
  interactive: boolean;
  selected: Tile | null;
  onTileClick: (tile: Tile) => void;
}

/** T4, G1: свои кости вертикально, в порядке `hand`. */
export function HandView({ hand, legalMoves, interactive, selected, onTileClick }: HandViewProps) {
  return (
    <div className={`hand ${interactive ? 'hand--active' : 'hand--idle'}`} data-testid="my-hand">
      {hand.map((tile) => {
        const playable = interactive && isPlayable(legalMoves, tile);
        const isSelected = selected !== null && sameTile(selected, tile);
        return (
          <button
            key={tileKey(tile)}
            type="button"
            className="hand-tile"
            data-testid={tileTestId(tile)}
            data-playable={playable ? 'true' : 'false'}
            data-selected={isSelected ? 'true' : 'false'}
            disabled={!playable}
            aria-pressed={isSelected}
            onClick={() => onTileClick(tile)}
          >
            <TileFace a={tile[0]} b={tile[1]} orientation="vertical" />
          </button>
        );
      })}
    </div>
  );
}
