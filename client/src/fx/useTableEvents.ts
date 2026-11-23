import { useState } from 'react';
import type { PlayerView } from '@domino/shared';
import { diffTable, type TableEvent } from './diffTable';

interface Snapshot {
  game: PlayerView;
  events: TableEvent[];
}

/**
 * spec-10: события стола для текущего `game`. Новый массив — ровно один раз на новую ссылку
 * `game` (новый `room:state`); первый рендер (F5, rejoin, монтирование) — `[]` (A1).
 * «Состояние из предыдущего рендера» вместо эффектов — двойной рендер StrictMode даёт тот же
 * результат, а подписчики реагируют на смену ссылки массива.
 */
export function useTableEvents(game: PlayerView): readonly TableEvent[] {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ game, events: [] }));
  if (snapshot.game !== game) {
    const next = { game, events: diffTable(snapshot.game, game) };
    setSnapshot(next);
    return next.events;
  }
  return snapshot.events;
}
