import { describe, expect, it } from 'vitest';
import { ACK_TIMEOUT_MS } from '../lobby/roomApi';
import { createFakeSocket } from '../test/fakeSocket';
import { sendMove } from './gameApi';

describe('sendMove', () => {
  it('T-5: returns an ok ack as is and sends game:move {move} with the ack timeout', async () => {
    const { fake, socket } = createFakeSocket();
    fake.emitWithAck.mockResolvedValue({ ok: true });
    const move = { type: 'play', tile: [3, 5], end: 'left' } as const;
    await expect(sendMove(socket, move)).resolves.toEqual({ ok: true });
    expect(fake.timeout).toHaveBeenCalledWith(ACK_TIMEOUT_MS);
    expect(fake.emitWithAck).toHaveBeenCalledWith('game:move', { move });
  });

  it('T-5: returns an error ack as is', async () => {
    const { fake, socket } = createFakeSocket();
    fake.emitWithAck.mockResolvedValue({ ok: false, error: 'NOT_YOUR_TURN' });
    await expect(sendMove(socket, { type: 'draw' })).resolves.toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('T-5: turns a rejected ack into "timeout"', async () => {
    const { fake, socket } = createFakeSocket();
    fake.emitWithAck.mockRejectedValue(new Error('operation has timed out'));
    await expect(sendMove(socket, { type: 'pass' })).resolves.toBe('timeout');
  });
});
