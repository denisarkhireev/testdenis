import { useSound } from './useSound';

/** spec-10 B1–B4: кнопка вкл/выкл звука в шапке. */
export function SoundToggle() {
  const { enabled, toggle } = useSound();
  const label = enabled ? 'Выключить звук' : 'Включить звук';
  return (
    <button
      type="button"
      className="sound-toggle"
      data-testid="sound-toggle"
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <span aria-hidden="true">{enabled ? '🔊' : '🔇'}</span>
    </button>
  );
}
