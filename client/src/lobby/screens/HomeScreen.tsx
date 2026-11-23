import { useState } from 'react';
import {
  DEFAULT_HAND_SIZE,
  DEFAULT_TURN_SECONDS,
  HAND_SIZE_OPTIONS,
  MATCH_TARGET,
  MATCH_TARGET_OPTIONS,
  TURN_SECONDS_OPTIONS,
  type RoomSettings,
} from '@domino/shared';
import {
  loadHandSize,
  loadMatchTarget,
  loadTurnSeconds,
  saveHandSize,
  saveMatchTarget,
  saveTurnSeconds,
} from '../storage';
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
  onCreate(name: string, settings: RoomSettings): void;
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
function initialChoice(options: readonly number[], saved: number | null, fallback: number): number {
  if (saved !== null && options.includes(saved)) return saved;
  return options.includes(fallback) ? fallback : (options[0] ?? fallback);
}

/**
 * Выбор из списка, который может смениться (hello приходит позже): выбор, которого нет
 * в новом списке, сбрасывается на сохранённое/значение по умолчанию.
 */
function useChoice(options: readonly number[], load: () => number | null, fallback: number) {
  // null — игрок ещё не выбирал.
  const [choice, setChoice] = useState<number | null>(null);
  const selected =
    choice !== null && options.includes(choice) ? choice : initialChoice(options, load(), fallback);
  return [selected, setChoice] as const;
}

interface ChoiceGroupProps {
  /** testid группы; варианты — `<testId>-<N>`. */
  testId: string;
  legend: string;
  options: readonly number[];
  selected: number;
  label(value: number): string;
  onChange(value: number): void;
}

function ChoiceGroup({ testId, legend, options, selected, label, onChange }: ChoiceGroupProps) {
  return (
    <fieldset className="lobby-choice" data-testid={testId} role="radiogroup">
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

  const handleCreate = (name: string) => {
    saveMatchTarget(matchTarget);
    saveHandSize(handSize);
    saveTurnSeconds(turnSeconds);
    onCreate(name, { matchTarget, handSize, turnSeconds });
  };

  return (
    <section data-testid="home-screen">
      <h2>Новая игра</h2>
      <ChoiceGroup
        testId="match-target-choice"
        legend="Играем до"
        options={matchTargetOptions}
        selected={matchTarget}
        label={targetLabel}
        onChange={setMatchTarget}
      />
      <ChoiceGroup
        testId="hand-size-choice"
        legend="Костей в руке"
        options={handSizeOptions}
        selected={handSize}
        label={String}
        onChange={setHandSize}
      />
      <ChoiceGroup
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
        onSubmit={handleCreate}
      />
    </section>
  );
}
