import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeSoundPlayer } from '../test/fx';
import { SoundProvider } from './SoundContext';
import { SoundToggle } from './SoundToggle';

const toggle = () => screen.getByTestId('sound-toggle');

function setup() {
  const player = fakeSoundPlayer();
  render(
    <SoundProvider player={player}>
      <SoundToggle />
    </SoundProvider>,
  );
  return player;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('SoundToggle (spec-10 §3.4)', () => {
  it('SN6: click toggles 🔊/🔇, aria-pressed and localStorage', () => {
    const player = setup();
    expect(toggle()).toHaveTextContent('🔊');
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(toggle()).toHaveAccessibleName('Выключить звук');

    fireEvent.click(toggle());
    expect(toggle()).toHaveTextContent('🔇');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(toggle()).toHaveAccessibleName('Включить звук');
    expect(localStorage.getItem('domino:sound')).toBe('off');
    expect(player.setEnabled).toHaveBeenLastCalledWith(false);

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('domino:sound')).toBe('on');
    expect(player.setEnabled).toHaveBeenLastCalledWith(true);
    // B4: клик по кнопке сам ничего не играет
    expect(player.play).not.toHaveBeenCalled();
  });

  it("SN6: starts muted when localStorage says 'off'", () => {
    localStorage.setItem('domino:sound', 'off');
    setup();
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(toggle()).toHaveTextContent('🔇');
  });

  it('S4/B4: the first pointerdown/keydown unlocks audio exactly once', () => {
    const player = setup();
    expect(player.unlock).not.toHaveBeenCalled();
    fireEvent.pointerDown(toggle());
    fireEvent.click(toggle());
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.pointerDown(document.body);
    expect(player.unlock).toHaveBeenCalledTimes(1);
  });
});
