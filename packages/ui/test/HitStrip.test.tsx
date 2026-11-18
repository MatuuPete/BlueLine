import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HitStrip } from '../src/components/HitStrip';

const GAMES = [27, 22, 31, 26, 29, 19, 28, 33, 25, 30];

describe('HitStrip', () => {
  it('renders one bar per game and marks the 8 that cleared 24.5', () => {
    render(<HitStrip values={GAMES} line={24.5} side="over" />);
    const strip = screen.getByRole('img');
    expect(strip.querySelectorAll('[data-hit]')).toHaveLength(10);
    expect(strip.querySelectorAll('[data-hit="true"]')).toHaveLength(8);
  });

  it('says how many of the last 10 games cleared the line', () => {
    render(<HitStrip values={GAMES} line={24.5} side="over" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'cleared the line in 8 of the last 10 games',
    );
  });

  it('prefixes the label with the player when given', () => {
    render(<HitStrip values={GAMES} line={24.5} side="over" label="Marcus Dell" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Marcus Dell: cleared the line in 8 of the last 10 games',
    );
  });

  it('flips the hit test for unders', () => {
    render(<HitStrip values={GAMES} line={24.5} side="under" />);
    expect(screen.getByRole('img').querySelectorAll('[data-hit="true"]')).toHaveLength(2);
  });

  it('counts a game on the line as a push, not a hit', () => {
    render(<HitStrip values={[25, 24, 25, 26]} line={25} side="over" />);
    const strip = screen.getByRole('img');
    expect(strip.querySelectorAll('[data-hit="true"]')).toHaveLength(1);
    expect(strip.querySelectorAll('[data-push="true"]')).toHaveLength(2);
    expect(strip).toHaveAttribute(
      'aria-label',
      'cleared the line in 1 of the last 4 games, 2 pushes',
    );
  });

  it('scales bar length by the margin so close calls look close', () => {
    render(<HitStrip values={[25, 34.5]} line={24.5} side="over" size="lg" />);
    const bars = [...screen.getByRole('img').querySelectorAll<HTMLElement>('[data-hit]')];
    const heights = bars.map((b) => parseFloat(b.style.height));
    expect(heights[0]).toBeLessThan(heights[1]!);
  });
});
