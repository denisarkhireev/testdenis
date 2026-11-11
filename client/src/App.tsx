import { useState } from 'react';
import { createSocket, type ClientSocket } from './socket';
import { useConnectionStatus, type ConnectionStatus } from './useConnectionStatus';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'connecting…',
  connected: 'connected',
  disconnected: 'disconnected',
};

export interface AppProps {
  socket?: ClientSocket;
}

export function App({ socket: socketProp }: AppProps) {
  const [socket] = useState<ClientSocket>(() => socketProp ?? createSocket());
  const status = useConnectionStatus(socket);

  return (
    <main>
      <h1>Domino</h1>
      <p data-testid="connection-status">{STATUS_TEXT[status]}</p>
    </main>
  );
}
