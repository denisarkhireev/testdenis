import { reactionById } from '@domino/shared';
import { useReducedMotion } from '../fx/useReducedMotion';
import type { Bubble } from './useReactions';
import './reactions.css';

export interface ReactionBubbleProps {
  who: 'mine' | 'opponent';
  bubble: Bubble | null;
}

/**
 * spec-12 RX10: якорь нулевой высоты (стол не прыгает) и облачко над ним.
 * У соперника «хвост» вверх к его руке, у себя — вниз к своей руке.
 */
export function ReactionBubble({ who, bubble }: ReactionBubbleProps) {
  const reducedMotion = useReducedMotion();
  const reaction = bubble ? reactionById(bubble.reactionId) : null;
  return (
    <div
      className={`reaction-anchor reaction-anchor--${who}`}
      data-testid={`reaction-anchor-${who}`}
    >
      {bubble && reaction && (
        <div
          key={bubble.seq}
          className={[
            'reaction-bubble',
            `reaction-bubble--${who}`,
            `reaction-bubble--${reaction.kind}`,
            reducedMotion ? '' : 'reaction-bubble--animated',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid={`reaction-bubble-${who}`}
          data-reaction-id={bubble.reactionId}
          role="status"
          aria-live="polite"
        >
          {reaction.text}
        </div>
      )}
    </div>
  );
}
