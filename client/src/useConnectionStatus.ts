import { useEffect, useState } from 'react';
import { PROTOCOL_VERSION, type ServerHelloPayload } from '@domino/shared';
import type { ClientSocket } from './socket';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useConnectionStatus(socket: ClientSocket): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const onHello = (payload: ServerHelloPayload) => {
      if (payload.protocolVersion === PROTOCOL_VERSION) {
        setStatus('connected');
      } else {
        console.error('Protocol version mismatch');
        setStatus('disconnected');
      }
    };
    const onDisconnect = () => setStatus('disconnected');

    socket.on('server:hello', onHello);
    socket.on('disconnect', onDisconnect);
    // Эффект App выполняется после эффектов детей (useLobby), так что к этому моменту
    // все подписки на `server:hello` уже есть.
    if (!socket.active) socket.connect();
    return () => {
      socket.off('server:hello', onHello);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return status;
}
