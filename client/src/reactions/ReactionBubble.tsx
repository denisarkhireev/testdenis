import { reactionById } from '@domino/shared';
import { useReducedMotion } from '../fx/useReducedMotion';
import type { Bubble } from './useReactions';
import './reactions.css';

export interface ReactionBubbleProps {
  who: 'mine' | 'opponent';
  bubble: Bubble | null;
  /**
   * spec-13 UI9: облачко сбоку строки (справа, по центру по вертикали, без «хвоста»).
   * У соперника — всегда; своё — только на итогах раунда.
   */
  side?: boolean;
}

/**
 * spec-12 RX10: якорь не занимает места (стол не прыгает), облачко — поверх.
 * spec-13 UI9: облачко соперника — справа на строке его руки; своё во время раунда — над
 * своей рукой с «хвостом» вниз.
 */
export function ReactionBubble({ who, bubble, side = who === 'opponent' }: ReactionBubbleProps) {
  const reducedMotion = useReducedMotion();
  const reaction = bubble ? reactionById(bubble.reactionId) : null;
  return (
    <div
      className={`reaction-anchor reaction-anchor--${who}${side ? ' reaction-anchor--side' : ''}`}
      data-testid={`reaction-anchor-${who}`}
    >
      {bubble && reaction && (
        <div
          key={bubble.seq}
          className={[
            'reaction-bubble',
            `reaction-bubble--${who}`,
            side ? 'reaction-bubble--side' : '',
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
