import { describe, expect, it } from 'vitest';
import { createFakeSocket } from '../test/fakeSocket';
import { ACK_TIMEOUT_MS, createRoom, joinRoom, rejoinRoom } from './roomApi';

describe('roomApi', () => {
  it('C6: createRoom returns an ok ack as is, with the ack timeout', async () => {
    const { fake, socket } = createFakeSocket();
    const ack = { ok: true, roomId: 'ABC234', seat: 0, playerToken: 't' };
    fake.emitWithAck.mockResolvedValue(ack);
    await expect(createRoom(socket, { name: 'Аня' })).resolves.toEqual(ack);
    expect(fake.timeout).toHaveBeenCalledWith(ACK_TIMEOUT_MS);
    expect(fake.emitWithAck).toHaveBeenCalledWith('room:create', { name: 'Аня' });
  });

  it('C6: createRoom returns an error ack as is', async () => {
    const { fake, socket } = createFakeSocket();
    fake.emitWithAck.mockResolvedValue({ ok: false, error: 'INVALID_NAME' });
    await expect(createRoom(socket, { name: '' })).resolves.toEqual({
      ok: false,
      error: 'INVALID_NAME',
    });
  });

  it('C6: createRoom turns a rejected ack into "timeout"', async () => {
    const { fake, socket } = createFakeSocket();
    fake.emitWithAck.mockRejectedValue(new Error('operation has timed out'));
    await expect(createRoom(socket, { name: 'Аня' })).resolves.toBe('timeout');
  });

  it('joinRoom / rejoinRoom send their events', async () => {
    const { fake, socket } = createFakeSocket();
    fake.emitWithAck.mockResolvedValue({ ok: true });
    await joinRoom(socket, { roomId: 'ABC234', name: 'Боб' });
    await rejoinRoom(socket, { roomId: 'ABC234', playerToken: 't' });
    expect(fake.emitWithAck).toHaveBeenNthCalledWith(1, 'room:join', {
      roomId: 'ABC234',
      name: 'Боб',
    });
    expect(fake.emitWithAck).toHaveBeenNthCalledWith(2, 'room:rejoin', {
      roomId: 'ABC234',
      playerToken: 't',
    });
  });
});
