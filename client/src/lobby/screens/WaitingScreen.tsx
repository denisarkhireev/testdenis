import { useEffect, useRef, useState } from 'react';

export const COPIED_TEXT = 'Ссылка скопирована';
export const COPY_MANUALLY_TEXT = 'Скопируйте ссылку вручную (Ctrl+C)';
export const COPIED_VISIBLE_MS = 2000;

export interface WaitingScreenProps {
  roomId: string;
  inviteUrl: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    // navigator.clipboard отсутствует вне secure context — TypeError тоже ловится здесь.
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function WaitingScreen({ roomId, inviteUrl }: WaitingScreenProps) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // L7
  const copy = async () => {
    const ok = await writeClipboard(inviteUrl);
    if (!mountedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (ok) {
      setCopyStatus(COPIED_TEXT);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopyStatus(null);
      }, COPIED_VISIBLE_MS);
    } else {
      inputRef.current?.select();
      setCopyStatus(COPY_MANUALLY_TEXT);
    }
  };

  return (
    <section data-testid="waiting-screen">
      <h2>Ожидаем соперника…</h2>
      <p>
        Код комнаты: <code>{roomId}</code>
      </p>
      <p>Отправьте другу ссылку — игра начнётся, как только он войдёт.</p>
      <div className="lobby-invite">
        <input
          ref={inputRef}
          data-testid="invite-link"
          aria-label="Ссылка-приглашение"
          readOnly
          value={inviteUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" data-testid="copy-button" onClick={() => void copy()}>
          Скопировать
        </button>
      </div>
      <p data-testid="copy-status" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}
