import { classicVariant } from './classic';
import { kozelVariant } from './kozel';
import type { RulesVariant, VariantId } from './types';

export type { RulesVariant, VariantId } from './types';
export { classicVariant } from './classic';
export { kozelVariant } from './kozel';
export { roundScorer } from './scorer';

export const VARIANT_IDS: readonly VariantId[] = ['classic', 'kozel'];
export const DEFAULT_VARIANT: VariantId = 'classic';

const VARIANTS: Record<VariantId, RulesVariant> = { classic: classicVariant, kozel: kozelVariant };

/** Вариант по id. Неизвестный id → throw (сервер передаёт только проверенное). */
export function getVariant(id: VariantId): RulesVariant {
  const variant = Object.prototype.hasOwnProperty.call(VARIANTS, id) ? VARIANTS[id] : undefined;
  if (!variant) throw new Error(`unknown rules variant: ${String(id)}`);
  return variant;
}
