import type { PlayerIndex, RoundResult } from '@domino/shared';

export interface RoundResultBannerProps {
  result: RoundResult;
  you: PlayerIndex;
  opponentName: string;
}

function roundResultText(result: RoundResult, you: PlayerIndex, opponentName: string) {
  const reason = result.reason === 'fish' ? ' (рыба)' : '';
  if (result.winner === null) return 'Рыба — ничья';
  if (result.winner === you) return `Вы выиграли раунд: +${result.points}${reason}`;
  return `Раунд выиграл ${opponentName}: +${result.points}${reason}`;
}

/** 3.5: минимальный итог раунда до #7. */
export function RoundResultBanner({ result, you, opponentName }: RoundResultBannerProps) {
  return (
    <p className="round-finished" data-testid="round-finished" role="status">
      {roundResultText(result, you, opponentName)}
    </p>
  );
}
