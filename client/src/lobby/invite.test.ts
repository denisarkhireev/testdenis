import { describe, expect, it } from 'vitest';
import { buildInviteUrl, parseRoomIdFromSearch } from './invite';

describe('invite link', () => {
  it('C1: buildInviteUrl puts the code into ?room on path /', () => {
    expect(buildInviteUrl('http://h:5173', 'ABC234')).toBe('http://h:5173/?room=ABC234');
  });

  it.each([
    ['', null],
    ['?room=abc234', 'ABC234'],
    ['?room=%20ABC234%20', 'ABC234'],
    ['?room=ABC23', 'invalid'],
    ['?room=ABCI01', 'invalid'],
    ['?x=1', null],
  ])('C2: parseRoomIdFromSearch(%j) → %j', (search, expected) => {
    expect(parseRoomIdFromSearch(search)).toBe(expected);
  });
});
