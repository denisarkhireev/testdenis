import type { VariantId } from '@domino/shared';

const LABELS: Record<VariantId, string> = { classic: 'Классика', kozel: 'Козёл' };

const HINTS: Record<VariantId, string> = {
  classic: 'Очки получает победитель раунда; выигрывает набравший цель.',
  kozel: 'Очки записываются проигравшему раунда; кто первым наберёт цель — козёл и проиграл.',
};

/** spec-16 §4.3: подпись варианта правил («Классика» / «Козёл»). */
export function variantLabel(id: VariantId): string {
  return LABELS[id];
}

/** spec-16 §4.3: однострочная подсказка под группой «Правила». */
export function variantHint(id: VariantId): string {
  return HINTS[id];
}
