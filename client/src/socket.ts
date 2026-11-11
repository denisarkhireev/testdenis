import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@domino/shared';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Без URL подключается к своему origin: в dev — через прокси Vite. */
export function createSocket(url?: string): ClientSocket {
  return url ? io(url, { autoConnect: true }) : io({ autoConnect: true });
}
