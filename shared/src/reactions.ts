/**
 * spec-12: фиксированный набор реакций (RX1). Единственный источник списка и текстов —
 * клиент и сервер берут их только отсюда. По проводу ходит только `id`.
 */
export interface ReactionDef {
  id: string;
  kind: 'emoji' | 'phrase';
  /** Что рисуется в кнопке и в облачке. */
  text: string;
  /** aria-label кнопки (для эмодзи — словами). */
  label: string;
}

/** Порядок = порядок кнопок на панели. */
export const REACTIONS = [
  { id: 'thumbs_up', kind: 'emoji', text: '👍', label: 'Класс' },
  { id: 'laugh', kind: 'emoji', text: '😂', label: 'Смешно' },
  { id: 'wow', kind: 'emoji', text: '😮', label: 'Ого' },
  { id: 'angry', kind: 'emoji', text: '😡', label: 'Злюсь' },
  { id: 'party', kind: 'emoji', text: '🎉', label: 'Ура' },
  { id: 'you_got_me', kind: 'phrase', text: 'Ну ты даёшь', label: 'Ну ты даёшь' },
  { id: 'fish', kind: 'phrase', text: 'Рыба!', label: 'Рыба!' },
  { id: 'hurry', kind: 'phrase', text: 'Ходи уже', label: 'Ходи уже' },
  { id: 'good_game', kind: 'phrase', text: 'Хорошая игра', label: 'Хорошая игра' },
] as const satisfies readonly ReactionDef[];

export type ReactionId = (typeof REACTIONS)[number]['id'];

export const REACTION_IDS: readonly ReactionId[] = REACTIONS.map((r) => r.id);

/** RX3: точное совпадение с id из списка; массив, а не словарь — ключи прототипа не проходят. */
export function isReactionId(value: unknown): value is ReactionId {
  return typeof value === 'string' && (REACTION_IDS as readonly string[]).includes(value);
}

export function reactionById(id: ReactionId): ReactionDef {
  return REACTIONS.find((r) => r.id === id)!;
}

/** RX4: минимальный интервал между реакциями одного игрока, мс. */
export const REACTION_COOLDOWN_MS = 2000;
/** RX10: сколько облачко видно на клиенте, мс. */
export const REACTION_SHOW_MS = 3000;
