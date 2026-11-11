import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './protocol';

describe('protocol', () => {
  it('U1: PROTOCOL_VERSION is an integer >= 1', () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });
});
