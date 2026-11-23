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
  /** spec-8 D9: база ссылки-приглашения из `server:hello`; нет — origin страницы. */
  publicUrl?: string;
  /** spec-11: варианты времени на ход из `server:hello`; нет — TURN_SECONDS_OPTIONS. */
  turnSecondsOptions?: number[] | undefined;
  /** spec-14: варианты цели матча и размера руки из `server:hello`; нет — константы shared. */
  matchTargetOptions?: number[] | undefined;
  defaultMatchTarget?: number | undefined;
  handSizeOptions?: number[] | undefined;
}

export function Lobby({
  socket,
  status,
  publicUrl,
  turnSecondsOptions,
  matchTargetOptions,
  defaultMatchTarget,
  handSizeOptions,
}: LobbyProps) {
  const { state, create, join, goHome } = useLobby(socket, status);
  const canSubmit = status === 'connected' && state.pending === null;

  switch (selectScreen(state)) {
    case 'closed':
      return <ClosedScreen reason={state.closed!} onHome={goHome} />;
    case 'game':
      return <GameScreen room={state.room!} socket={socket} status={status} onHome={goHome} />;
    case 'waiting':
      return (
        <WaitingScreen
          roomId={state.room!.roomId}
          settings={state.room!}
          inviteUrl={buildInviteUrl(publicUrl ?? window.location.origin, state.room!.roomId)}
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
          settings={state.roomInfo}
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
          turnSecondsOptions={turnSecondsOptions}
          matchTargetOptions={matchTargetOptions}
          defaultMatchTarget={defaultMatchTarget}
          handSizeOptions={handSizeOptions}
          onCreate={(name, settings, opponent) => void create(name, settings, opponent)}
        />
      );
  }
}
