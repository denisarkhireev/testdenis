import { useEffect, useRef, useState } from 'react';
import { REACTIONS, type ReactionId } from '@domino/shared';
import './reactions.css';

export interface ReactionPanelProps {
  canSend: boolean;
  error: string | null;
  onSend(reactionId: ReactionId): void;
}

/** spec-12 §4.3: кнопка 💬 и панель из 9 реакций в порядке REACTIONS. */
export function ReactionPanel({ canSend, error, onSend }: ReactionPanelProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="reactions" ref={rootRef}>
      <button
        type="button"
        className="reaction-toggle"
        data-testid="reaction-toggle"
        aria-label="Реакции"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        💬
      </button>
      {open && (
        <div
          className="reaction-panel"
          data-testid="reaction-panel"
          role="group"
          aria-label="Реакции"
        >
          {REACTIONS.map((reaction) => (
            <button
              key={reaction.id}
              type="button"
              className={`reaction-button reaction-button--${reaction.kind}`}
              data-testid={`reaction-${reaction.id}`}
              aria-label={reaction.label}
              disabled={!canSend}
              onClick={() => {
                onSend(reaction.id);
                setOpen(false);
              }}
            >
              {reaction.text}
            </button>
          ))}
        </div>
      )}
      <p className="reaction-error" data-testid="reaction-error" role="alert">
        {error ?? ''}
      </p>
    </div>
  );
}
