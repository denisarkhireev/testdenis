import type { RoomStatePayload } from '@domino/shared';
import { describe, expect, it } from 'vitest';
import { selectScreen, type LobbyState, type Screen } from './useLobby';

const base: LobbyState = {
  urlRoom: null,
  session: null,
  room: null,
  closed: null,
  pending: null,
  error: null,
  badLink: false,
};

const room = (phase: RoomStatePayload['phase']): RoomStatePayload => ({
  roomId: 'ABC234',
  you: 0,
  phase,
  players: [{ seat: 0, name: 'Аня', connected: true }],
  game: null,
});

const session = { roomId: 'ABC234', playerToken: 't' };

describe('selectScreen', () => {
  it.each<[string, Partial<LobbyState>, Screen]>([
    ['closed wins over room', { closed: 'player_left', room: room('playing'), session }, 'closed'],
    ['waiting room', { room: room('waiting'), session }, 'waiting'],
    ['playing room', { room: room('playing'), session }, 'game'],
    ['finished room → game', { room: room('finished'), session }, 'game'],
    ['room wins over rejoin in flight', { room: room('playing'), pending: 'rejoin' }, 'game'],
    ['session without room → restoring', { session, urlRoom: 'ABC234' }, 'restoring'],
    ['rejoin in flight → restoring', { pending: 'rejoin' }, 'restoring'],
    ['invalid url', { urlRoom: 'invalid' }, 'bad-link'],
    ['ROOM_NOT_FOUND on join', { urlRoom: 'ABC234', badLink: true }, 'bad-link'],
    ['valid url → join', { urlRoom: 'ABC234' }, 'join'],
    ['join with an error', { urlRoom: 'ABC234', error: 'x' }, 'join'],
    ['nothing → home', {}, 'home'],
  ])('C5: %s', (_name, patch, expected) => {
    expect(selectScreen({ ...base, ...patch })).toBe(expected);
  });
});
