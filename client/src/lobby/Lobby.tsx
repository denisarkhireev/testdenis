import type { ClientSocket } from '../socket';
import type { ConnectionStatus } from '../useConnectionStatus';
import { buildInviteUrl } from './invite';
import { BadLinkScreen } from './screens/BadLinkScreen';
import { ClosedScreen } from './screens/ClosedScreen';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { JoinScreen } from './screens/JoinScreen';
import { RestoringScreen } from './screens/RestoringScreen';
import { WaitingScreen } from './screens/WaitingScreen';
import { selectScreen, useLobby } from './useLobby';
import './lobby.css';

export interface LobbyProps {
  socket: ClientSocket;
  status: ConnectionStatus;
}

export function Lobby({ socket, status }: LobbyProps) {
  const { state, create, join, goHome } = useLobby(socket, status);
  const canSubmit = status === 'connected' && state.pending === null;

  switch (selectScreen(state)) {
    case 'closed':
      return <ClosedScreen reason={state.closed!} onHome={goHome} />;
    case 'game':
      return <GameScreen room={state.room!} socket={socket} status={status} />;
    case 'waiting':
      return (
        <WaitingScreen
          roomId={state.room!.roomId}
          inviteUrl={buildInviteUrl(window.location.origin, state.room!.roomId)}
        />
      );
    case 'restoring':
      return <RestoringScreen />;
    case 'bad-link':
      return <BadLinkScreen onHome={goHome} />;
    case 'join':
      return (
        <JoinScreen
          roomId={state.urlRoom!}
          canSubmit={canSubmit}
          error={state.error}
          onJoin={(name) => void join(name)}
        />
      );
    case 'home':
      return (
        <HomeScreen
          canSubmit={canSubmit}
          error={state.error}
          onCreate={(name) => void create(name)}
        />
      );
  }
}
