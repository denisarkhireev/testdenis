import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@domino/shared';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Без URL подключается к своему origin: в dev — через прокси Vite.
 * Соединение открывает `useConnectionStatus` уже после подписки на события: иначе
 * `server:hello` мог прийти раньше React-эффектов и потеряться (вкладка висла в «connecting…»).
 */
export function createSocket(url?: string): ClientSocket {
  return url ? io(url, { autoConnect: false }) : io({ autoConnect: false });
}
