import { useState, type FormEvent } from 'react';
import { loadName } from '../storage';
import { isValidName, NAME_MAX_LENGTH } from '../useLobby';

export interface NameFormProps {
  submitLabel: string;
  submitTestId: string;
  /** Соединение есть и запрос не в полёте (L4). */
  canSubmit: boolean;
  error: string | null;
  onSubmit(name: string): void;
  /** spec-15: вторая кнопка под основной (та же активность); Enter в поле — по-прежнему основная. */
  /** spec-17: `disabled` — кнопка недоступна независимо от имени (бот в режиме 2 на 2). */
  secondary?:
    { label: string; testId: string; disabled?: boolean; onSubmit(name: string): void } | undefined;
}

/** Общая форма home/join: Enter в поле = клик по кнопке. */
export function NameForm({
  submitLabel,
  submitTestId,
  canSubmit,
  error,
  onSubmit,
  secondary,
}: NameFormProps) {
  const [name, setName] = useState(loadName);
  const enabled = canSubmit && isValidName(name);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (enabled) onSubmit(name);
  };

  return (
    <form className="lobby-form" onSubmit={handleSubmit}>
      <label>
        Ваше имя
        <input
          data-testid="name-input"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          autoFocus
          autoComplete="nickname"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button type="submit" data-testid={submitTestId} disabled={!enabled}>
        {submitLabel}
      </button>
      {secondary && (
        <button
          type="button"
          data-testid={secondary.testId}
          disabled={!enabled || secondary.disabled === true}
          onClick={() => {
            if (enabled && !secondary.disabled) secondary.onSubmit(name);
          }}
        >
          {secondary.label}
        </button>
      )}
      {error && (
        <p className="lobby-error" role="alert" data-testid="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
