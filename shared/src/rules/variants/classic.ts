import { recordRound } from '../match';
import { resolveRound } from '../scoring';
import type { RulesVariant } from './types';

/** Классика (spec-3 R11–R13, spec-7 M2–M3) — ровно существующие функции. */
export const classicVariant: RulesVariant = { id: 'classic', resolveRound, recordRound };
