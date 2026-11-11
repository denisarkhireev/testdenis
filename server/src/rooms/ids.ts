import { randomInt, randomUUID } from 'node:crypto';

/** Алфавит кода комнаты: без похожих I, O, 0, 1 (K2). */
export const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_ID_LENGTH = 6;
const MAX_ATTEMPTS = 100;

function randomRoomId(): string {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)];
  }
  return id;
}

/** Случайный код комнаты, которого нет среди живых (`exists` → перегенерировать). */
export function generateRoomId(exists: (id: string) => boolean = () => false): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = randomRoomId();
    if (!exists(id)) return id;
  }
  throw new Error('generateRoomId: too many collisions');
}

/** Секрет места для room:rejoin (K3). */
export function generateToken(): string {
  return randomUUID();
}
