import { useEffect, useState } from 'react';
import { PROTOCOL_VERSION, type ServerHelloPayload } from '@domino/shared';
import type { ClientSocket } from './socket';

/**
 * spec-9 RC14: `connecting` до первого hello → `connected` → при обрыве `reconnecting`
 * (socket.io переподключается сам) или `disconnected` (ручной disconnect / не та версия протокола).
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ConnectionInfo {
  status: ConnectionStatus;
  /** spec-8 D9: публичный origin из последнего `server:hello` (если сервер его прислал). */
  publicUrl: string | undefined;
}

export function useConnectionStatus(socket: ClientSocket): ConnectionInfo {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [publicUrl, setPublicUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onHello = (payload: ServerHelloPayload) => {
      if (payload.protocolVersion === PROTOCOL_VERSION) {
        setStatus('connected');
        setPublicUrl(payload.publicUrl || undefined);
      } else {
        console.error('Protocol version mismatch');
        setStatus('disconnected');
      }
    };
    const onDisconnect = () => setStatus(socket.active ? 'reconnecting' : 'disconnected');
    // RC15: браузер сообщил о пропаже сети — рвём транспорт сразу, не дожидаясь ping-таймаута;
    // socket.io уйдёт в авто-переподключение. На `online` ничего не делаем: backoff уже идёт.
    const onOffline = () => socket.io.engine?.close();

    socket.on('server:hello', onHello);
    socket.on('disconnect', onDisconnect);
    window.addEventListener('offline', onOffline);
    // Эффект App выполняется после эффектов детей (useLobby), так что к этому моменту
    // все подписки на `server:hello` уже есть.
    if (!socket.active) socket.connect();
    return () => {
      socket.off('server:hello', onHello);
      socket.off('disconnect', onDisconnect);
      window.removeEventListener('offline', onOffline);
    };
  }, [socket]);

  return { status, publicUrl };
}
