import { useState } from 'react';
import {
  DEFAULT_HAND_SIZE,
  DEFAULT_TURN_SECONDS,
  HAND_SIZE_OPTIONS,
  MATCH_TARGET,
  MATCH_TARGET_OPTIONS,
  TURN_SECONDS_OPTIONS,
  DEFAULT_ROOM_MODE,
  DEFAULT_VARIANT,
  ROOM_MODES,
  VARIANT_OPTIONS,
  type Opponent,
  type RoomMode,
  type RoomSettings,
  type VariantId,
} from '@domino/shared';
import {
  loadHandSize,
  loadMatchTarget,
  loadMode,
  loadTurnSeconds,
  loadVariant,
  saveHandSize,
  saveMatchTarget,
  saveMode,
  saveTurnSeconds,
  saveVariant,
} from '../storage';
import { variantHint, variantLabel } from '../variant';
import { NameForm } from './NameForm';

export interface HomeScreenProps {
  canSubmit: boolean;
  error: string | null;
  /** spec-11: варианты из `server:hello.turnSecondsOptions`; пока его нет — TURN_SECONDS_OPTIONS. */
  turnSecondsOptions?: readonly number[] | undefined;
  /** spec-14: варианты из `server:hello.matchTargetOptions`; пока его нет — MATCH_TARGET_OPTIONS. */
  matchTargetOptions?: readonly number[] | undefined;
  /** spec-14: `server:hello.defaultMatchTarget`; пока его нет — 101. */
  defaultMatchTarget?: number | undefined;
  /** spec-14: варианты из `server:hello.handSizeOptions`; пока его нет — HAND_SIZE_OPTIONS. */
  handSizeOptions?: readonly number[] | undefined;
  /** spec-15: `opponent` — 'bot' для «Играть с ботом». */
  onCreate(name: string, settings: RoomSettings, opponent: Opponent): void;
}

/** Подпись времени на ход: «Выкл», «30 с»; значения не из стандартного списка — тестовые (spec-11 §4.4). */
function turnLabel(seconds: number): string {
  if (seconds === 0) return 'Выкл';
  return TURN_SECONDS_OPTIONS.includes(seconds) ? `${seconds} с` : `${seconds} с (тест)`;
}

/** spec-14 §4.3: цель не из стандартного списка — тестовая (MATCH_TARGET из env). */
function targetLabel(target: number): string {
  return MATCH_TARGET_OPTIONS.includes(target) ? String(target) : `${target} (тест)`;
}

/** Сохранённый выбор, если он есть в списке; иначе значение по умолчанию (spec-11 §4.3, spec-14). */
function initialChoice<T extends string | number>(
  options: readonly T[],
  saved: T | null,
  fallback: T,
): T {
  if (saved !== null && options.includes(saved)) return saved;
  return options.includes(fallback) ? fallback : (options[0] ?? fallback);
}

/**
 * Выбор из списка, который может смениться (hello приходит позже): выбор, которого нет
 * в новом списке, сбрасывается на сохранённое/значение по умолчанию.
 */
function useChoice<T extends string | number>(
  options: readonly T[],
  load: () => T | null,
  fallback: T,
) {
  // null — игрок ещё не выбирал.
  const [choice, setChoice] = useState<T | null>(null);
  const selected =
    choice !== null && options.includes(choice) ? choice : initialChoice(options, load(), fallback);
  return [selected, setChoice] as const;
}

/** spec-17 §4.3: подписи режима комнаты. */
const MODE_LABELS: Record<RoomMode, string> = { '1x1': '1 на 1', '2x2': '2 на 2' };
const modeLabel = (mode: RoomMode): string => MODE_LABELS[mode];

/** spec-17 Q2: в 2×2 рука всегда из 7 костей. */
const TEAM_HAND_SIZE = DEFAULT_HAND_SIZE;

interface ChoiceGroupProps<T extends string | number> {
  /** testid группы; варианты — `<testId>-<value>`. */
  testId: string;
  legend: string;
  options: readonly T[];
  selected: T;
  label(value: T): string;
  onChange(value: T): void;
  /** spec-17: группа недоступна (размер руки в 2×2). */
  disabled?: boolean;
}

function ChoiceGroup<T extends string | number>({
  testId,
  legend,
  options,
  selected,
  label,
  onChange,
  disabled = false,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset className="lobby-choice" data-testid={testId} role="radiogroup" disabled={disabled}>
      <legend>{legend}</legend>
      {options.map((value) => (
        <label key={value} className="lobby-option">
          <input
            type="radio"
            name={testId}
            value={value}
            data-testid={`${testId}-${value}`}
            checked={selected === value}
            onChange={() => onChange(value)}
          />
          {label(value)}
        </label>
      ))}
    </fieldset>
  );
}

export function HomeScreen({
  canSubmit,
  error,
  turnSecondsOptions = TURN_SECONDS_OPTIONS,
  matchTargetOptions = MATCH_TARGET_OPTIONS,
  defaultMatchTarget = MATCH_TARGET,
  handSizeOptions = HAND_SIZE_OPTIONS,
  onCreate,
}: HomeScreenProps) {
  const [mode, setMode] = useChoice<RoomMode>(ROOM_MODES, loadMode, DEFAULT_ROOM_MODE);
  const team = mode === '2x2';
  const [variant, setVariant] = useChoice<VariantId>(VARIANT_OPTIONS, loadVariant, DEFAULT_VARIANT);
  const [matchTarget, setMatchTarget] = useChoice(
    matchTargetOptions,
    loadMatchTarget,
    defaultMatchTarget,
  );
  const [handSize, setHandSize] = useChoice(handSizeOptions, loadHandSize, DEFAULT_HAND_SIZE);
  const [turnSeconds, setTurnSeconds] = useChoice(
    turnSecondsOptions,
    loadTurnSeconds,
    DEFAULT_TURN_SECONDS,
  );

  const handleCreate = (name: string, opponent: Opponent) => {
    saveMode(mode);
    saveVariant(variant);
    saveMatchTarget(matchTarget);
    // spec-17: в 2×2 размер руки фиксирован — сохранённый выбор для 1×1 не трогаем.
    if (!team) saveHandSize(handSize);
    saveTurnSeconds(turnSeconds);
    const size = team ? TEAM_HAND_SIZE : handSize;
    onCreate(name, { matchTarget, handSize: size, turnSeconds, variant, mode }, opponent);
  };

  return (
    <section data-testid="home-screen">
      <h2>Новая игра</h2>
      <ChoiceGroup<RoomMode>
        testId="mode-choice"
        legend="Игроки"
        options={ROOM_MODES}
        selected={mode}
        label={modeLabel}
        onChange={setMode}
      />
      {team && (
        <p className="lobby-hint" data-testid="mode-hint">
          2 на 2: напарник напротив, по 7 костей, базара нет
        </p>
      )}
      <ChoiceGroup<VariantId>
        testId="variant-choice"
        legend="Правила"
        options={VARIANT_OPTIONS}
        selected={variant}
        label={variantLabel}
        onChange={setVariant}
      />
      <p className="lobby-hint" data-testid="variant-hint">
        {variantHint(variant)}
      </p>
      <ChoiceGroup<number>
        testId="match-target-choice"
        legend="Играем до"
        options={matchTargetOptions}
        selected={matchTarget}
        label={targetLabel}
        onChange={setMatchTarget}
      />
      <ChoiceGroup<number>
        testId="hand-size-choice"
        legend="Костей в руке"
        options={handSizeOptions}
        selected={team ? TEAM_HAND_SIZE : handSize}
        label={String}
        onChange={setHandSize}
        disabled={team}
      />
      <ChoiceGroup<number>
        testId="turn-seconds"
        legend="Время на ход"
        options={turnSecondsOptions}
        selected={turnSeconds}
        label={turnLabel}
        onChange={setTurnSeconds}
      />
      <NameForm
        submitLabel="Создать игру"
        submitTestId="create-button"
        canSubmit={canSubmit}
        error={error}
        onSubmit={(name) => handleCreate(name, 'human')}
        secondary={{
          label: 'Играть с ботом',
          testId: 'bot-button',
          disabled: team,
          onSubmit: (name) => handleCreate(name, 'bot'),
        }}
      />
    </section>
  );
}
