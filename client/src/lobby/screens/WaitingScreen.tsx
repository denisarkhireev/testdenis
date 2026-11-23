import { useEffect, useRef, useState } from 'react';
import type { PlayerIndex, RoomMode, RoomPlayer, RoomSettings } from '@domino/shared';
import { RoomSettingsLine } from '../RoomSettingsLine';

export const COPIED_TEXT = 'Ссылка скопирована';
export const COPY_MANUALLY_TEXT = 'Скопируйте ссылку вручную (Ctrl+C)';
export const COPIED_VISIBLE_MS = 2000;

export interface WaitingScreenProps {
  roomId: string;
  /** spec-14 S8: настройки комнаты (из room:state) — создатель видит, что выбрал. */
  settings: RoomSettings;
  inviteUrl: string;
  /** spec-17: режим комнаты; в 2×2 — счётчик и список мест. По умолчанию 1×1. */
  mode?: RoomMode;
  /** spec-17: занятые места (room:state.players). */
  players?: RoomPlayer[];
  /** spec-17: своё место. */
  you?: PlayerIndex;
}

const TEAM_SEATS = [0, 1, 2, 3] as const;

/** spec-17 §4.3: «Место 1 · Команда 1: Аня (вы)» / «Место 2 · Команда 2: свободно». */
function TeamSeats({ players, you }: { players: RoomPlayer[]; you: PlayerIndex | undefined }) {
  return (
    <ul className="waiting-seats" data-testid="waiting-seats">
      {TEAM_SEATS.map((seat) => {
        const player = players.find((p) => p.seat === seat);
        return (
          <li key={seat} data-testid={`waiting-seat-${seat}`} data-free={player ? 'false' : 'true'}>
            Место {seat + 1} · Команда {(seat % 2) + 1}:{' '}
            {player ? (
              <>
                {player.name}
                {seat === you && ' (вы)'}
              </>
            ) : (
              <span className="waiting-seat-free">свободно</span>
            )}
          </li>
        );
      })}
    </ul>
  );
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

export function WaitingScreen({
  roomId,
  settings,
  inviteUrl,
  mode = '1x1',
  players = [],
  you,
}: WaitingScreenProps) {
  const team = mode === '2x2';
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
      {team ? (
        <h2 data-testid="waiting-count">Ожидаем игроков: {players.length}/4</h2>
      ) : (
        <h2>Ожидаем соперника…</h2>
      )}
      <p>
        Код комнаты: <code>{roomId}</code>
      </p>
      <RoomSettingsLine settings={settings} testId="waiting-settings" />
      {team ? (
        <>
          <TeamSeats players={players} you={you} />
          <p>
            Отправьте ссылку троим друзьям — игра начнётся, когда займут все четыре места. Команды:
            места 1 и 3 против мест 2 и 4.
          </p>
        </>
      ) : (
        <p>Отправьте другу ссылку — игра начнётся, как только он войдёт.</p>
      )}
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
