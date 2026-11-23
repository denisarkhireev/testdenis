import { useLayoutEffect, useRef, type RefObject } from 'react';
import { tileTestId } from '../game/moves';
import type { TableEvent } from './diffTable';

export const PLAY_MS = 250;
export const DRAW_MS = 180;

interface Box {
  x: number;
  y: number;
  width: number;
}

/** AN4: прямоугольники возможных источников полёта на момент коммита. */
interface Rects {
  /** testid всех костей руки (в т.ч. без прямоугольника) — для поиска добранной кости. */
  handIds: Set<string>;
  hand: Map<string, Box>;
  opponentLast: Box | null;
  opponentHand: Box | null;
  boneyard: Box | null;
}

const EMPTY: Rects = {
  handIds: new Set(),
  hand: new Map(),
  opponentLast: null,
  opponentHand: null,
  boneyard: null,
};

/** Центр и ширина; нулевой прямоугольник (элемент скрыт / jsdom) — null (AN6). */
function boxOf(element: Element | null | undefined): Box | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width };
}

function lastOf(root: HTMLElement, selector: string): Element | null {
  const all = root.querySelectorAll(selector);
  return all.length > 0 ? all[all.length - 1]! : null;
}

/**
 * Летящий элемент сдвинут `transform`-ом — его прямоугольник берётся из прошлого замера,
 * чтобы перерисовка посреди полёта (например, выбор кости) не испортила источник.
 */
function measure(root: HTMLElement, prev: Rects): Rects {
  const handIds = new Set<string>();
  const hand = new Map<string, Box>();
  for (const element of root.querySelectorAll('[data-testid^="hand-tile-"]')) {
    const id = element.getAttribute('data-testid')!;
    handIds.add(id);
    const box = element.classList.contains('is-flying') ? prev.hand.get(id) : boxOf(element);
    if (box) hand.set(id, box);
  }
  const opponentLast = lastOf(root, '[data-testid="opponent-tile"]');
  return {
    handIds,
    hand,
    opponentLast: opponentLast?.classList.contains('is-flying')
      ? prev.opponentLast
      : boxOf(opponentLast),
    opponentHand: boxOf(root.querySelector('[data-testid="opponent-hand"]')),
    boneyard: boxOf(root.querySelector('[data-testid="boneyard-count"]')),
  };
}

interface Flight {
  target: Element;
  source: Box;
  kind: 'play' | 'draw';
}

function planFlights(root: HTMLElement, events: readonly TableEvent[], prev: Rects): Flight[] {
  const flights: Flight[] = [];
  for (const event of events) {
    if (event.type === 'play') {
      const target = root.querySelector(`[data-testid="board-tile-${event.boardIndex}"]`);
      const source =
        event.who === 'me'
          ? prev.hand.get(tileTestId(event.tile))
          : (prev.opponentLast ?? prev.opponentHand);
      if (target && source) flights.push({ target, source, kind: 'play' });
    } else if (event.type === 'draw') {
      const target =
        event.who === 'me'
          ? [...root.querySelectorAll('[data-testid^="hand-tile-"]')].find(
              (element) => !prev.handIds.has(element.getAttribute('data-testid')!),
            )
          : lastOf(root, '[data-testid="opponent-tile"]');
      const source = prev.boneyard ?? boxOf(root.querySelector('[data-testid="boneyard-count"]'));
      if (target && source) flights.push({ target, source, kind: 'draw' });
    }
  }
  return flights;
}

function launch({ target, source, kind }: Flight): Animation | null {
  const to = boxOf(target);
  if (!to) return null;
  const dx = Math.round(source.x - to.x);
  const dy = Math.round(source.y - to.y);
  const from =
    kind === 'play'
      ? { transform: `translate(${dx}px, ${dy}px) scale(${(source.width / to.width).toFixed(3)})` }
      : { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 };
  const keyframes: Keyframe[] =
    kind === 'play' ? [from, { transform: 'none' }] : [from, { transform: 'none', opacity: 1 }];
  const animation = target.animate(keyframes, {
    duration: kind === 'play' ? PLAY_MS : DRAW_MS,
    easing: 'ease-out',
  });
  target.classList.add('is-flying');
  const land = () => target.classList.remove('is-flying');
  animation.onfinish = land;
  animation.oncancel = land;
  return animation;
}

/**
 * spec-10 AN1–AN7: FLIP-полёт костей. DOM уже нарисован в итоговом состоянии; целевой элемент
 * анимируется «из точки источника в своё место». Ввод не блокируется.
 */
export function useTileFlights(
  containerRef: RefObject<HTMLElement | null>,
  events: readonly TableEvent[],
  reducedMotion: boolean,
): void {
  const rectsRef = useRef<Rects>(EMPTY);
  const runningRef = useRef<Animation[]>([]);
  const handledRef = useRef<readonly TableEvent[] | null>(null);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const fresh = handledRef.current !== events;
    handledRef.current = events;

    if (fresh) {
      // AN5: следующий room:state во время полёта — текущие полёты доводятся до конца.
      for (const animation of runningRef.current) animation.finish();
      runningRef.current = [];
    }

    const prev = rectsRef.current;
    rectsRef.current = measure(root, prev);

    const canAnimate = typeof Element.prototype.animate === 'function';
    if (!fresh || reducedMotion || !canAnimate || events.length === 0) return;
    for (const flight of planFlights(root, events, prev)) {
      const animation = launch(flight);
      if (animation) runningRef.current.push(animation);
    }
  });

  useLayoutEffect(
    () => () => {
      for (const animation of runningRef.current) animation.cancel();
      runningRef.current = [];
    },
    [],
  );
}
