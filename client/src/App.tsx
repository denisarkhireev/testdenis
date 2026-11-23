import { useState } from 'react';
import { Lobby } from './lobby/Lobby';
import { createSocket, type ClientSocket } from './socket';
import { SoundProvider } from './sound/SoundContext';
import type { SoundPlayer } from './sound/sounds';
import { SoundToggle } from './sound/SoundToggle';
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
  /** Для тестов: плеер звуков вместо Web Audio (spec-10). */
  soundPlayer?: SoundPlayer;
}

export function App({ socket: socketProp, soundPlayer }: AppProps) {
  const [socket] = useState<ClientSocket>(() => socketProp ?? createSocket());
  const { status, publicUrl, ...createOptions } = useConnectionStatus(socket);

  return (
    <SoundProvider player={soundPlayer}>
      <main>
        {status === 'reconnecting' && (
          <p className="reconnecting-banner" data-testid="reconnecting-banner" role="status">
            Переподключение…
          </p>
        )}
        <header className="app-header">
          <h1>Domino</h1>
          <SoundToggle />
        </header>
        <p data-testid="connection-status">{STATUS_TEXT[status]}</p>
        <Lobby socket={socket} status={status} publicUrl={publicUrl} {...createOptions} />
      </main>
    </SoundProvider>
  );
}
