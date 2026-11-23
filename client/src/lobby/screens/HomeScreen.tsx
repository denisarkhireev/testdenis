import { useState } from 'react';
import { DEFAULT_TURN_SECONDS, TURN_SECONDS_OPTIONS } from '@domino/shared';
import { loadTurnSeconds, saveTurnSeconds } from '../storage';
import { NameForm } from './NameForm';

export interface HomeScreenProps {
  canSubmit: boolean;
  error: string | null;
  /** spec-11: варианты из `server:hello.turnSecondsOptions`; пока его нет — TURN_SECONDS_OPTIONS. */
  turnSecondsOptions?: readonly number[];
  onCreate(name: string, turnSeconds: number): void;
}

/** Подпись варианта: «Выкл», «30 с»; значения не из стандартного списка — тестовые (spec-11 §4.4). */
function optionLabel(seconds: number): string {
  if (seconds === 0) return 'Выкл';
  return TURN_SECONDS_OPTIONS.includes(seconds) ? `${seconds} с` : `${seconds} с (тест)`;
}

/** Сохранённый выбор, если он есть в списке; иначе 60 (spec-11 §4.3). */
function initialChoice(options: readonly number[]): number {
  const saved = loadTurnSeconds();
  return saved !== null && options.includes(saved) ? saved : DEFAULT_TURN_SECONDS;
}

export function HomeScreen({
  canSubmit,
  error,
  turnSecondsOptions = TURN_SECONDS_OPTIONS,
  onCreate,
}: HomeScreenProps) {
  // null — игрок ещё не выбирал: берём сохранённое/60 по актуальному списку (hello может прийти позже).
  const [choice, setChoice] = useState<number | null>(null);
  const selected =
    choice !== null && turnSecondsOptions.includes(choice)
      ? choice
      : initialChoice(turnSecondsOptions);

  const handleCreate = (name: string) => {
    saveTurnSeconds(selected);
    onCreate(name, selected);
  };

  return (
    <section data-testid="home-screen">
      <h2>Новая игра</h2>
      <fieldset className="turn-seconds" data-testid="turn-seconds" role="radiogroup">
        <legend>Время на ход</legend>
        {turnSecondsOptions.map((seconds) => (
          <label key={seconds} className="turn-seconds-option">
            <input
              type="radio"
              name="turn-seconds"
              value={seconds}
              data-testid={`turn-seconds-${seconds}`}
              checked={selected === seconds}
              onChange={() => setChoice(seconds)}
            />
            {optionLabel(seconds)}
          </label>
        ))}
      </fieldset>
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
