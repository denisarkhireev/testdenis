import { useState } from 'react';
import { Lobby } from './lobby/Lobby';
import { createSocket, type ClientSocket } from './socket';
import { useConnectionStatus, type ConnectionStatus } from './useConnectionStatus';
import './app.css';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'connecting…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
};

export interface AppProps {
  socket?: ClientSocket;
}

export function App({ socket: socketProp }: AppProps) {
  const [socket] = useState<ClientSocket>(() => socketProp ?? createSocket());
  const { status, publicUrl } = useConnectionStatus(socket);

  return (
    <main>
      {status === 'reconnecting' && (
        <p className="reconnecting-banner" data-testid="reconnecting-banner" role="status">
          Переподключение…
        </p>
      )}
      <h1>Domino</h1>
      <p data-testid="connection-status">{STATUS_TEXT[status]}</p>
      <Lobby socket={socket} status={status} publicUrl={publicUrl} />
    </main>
  );
}
