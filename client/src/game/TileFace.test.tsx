import { cleanup, render, screen } from '@testing-library/react';
import type { Pip } from '@domino/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { TileFace } from './TileFace';

const PIPS: Pip[] = [0, 1, 2, 3, 4, 5, 6];

afterEach(cleanup);

describe('TileFace', () => {
  it.each(['vertical', 'horizontal'] as const)(
    'T-6: %s — pips in each half equal its value, aria-label "a-b"',
    (orientation) => {
      for (const a of PIPS) {
        const b = (6 - a) as Pip;
        render(<TileFace a={a} b={b} orientation={orientation} />);
        const tile = screen.getByRole('img', { name: `${a}-${b}` });
        const halves = tile.querySelectorAll('.tile-half');
        expect(halves).toHaveLength(2);
        expect(halves[0]!.querySelectorAll('.pip')).toHaveLength(a);
        expect(halves[1]!.querySelectorAll('.pip')).toHaveLength(b);
        expect(tile).toHaveClass(`tile--${orientation}`);
        cleanup();
      }
    },
  );
});
