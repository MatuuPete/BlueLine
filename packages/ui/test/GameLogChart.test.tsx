import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameLogChart } from '../src/components/GameLogChart';

const entries = [
  { value: 28, label: '@ MIA', sublabel: 'Nov 10', isH2h: false },
  { value: 22, label: 'vs NYK', sublabel: 'Nov 12', isH2h: true },
  { value: 25, label: '@ ORL', sublabel: 'Nov 14', isH2h: false },
  { value: 24, label: 'vs PHI', sublabel: 'Nov 16', isH2h: false },
];

describe('GameLogChart', () => {
  it('grades each bar against the line', () => {
    const { container } = render(<GameLogChart entries={entries} line={25} side="over" />);
    const results = [...container.querySelectorAll('[data-result]')].map((b) =>
      b.getAttribute('data-result'),
    );
    expect(results).toEqual(['hit', 'miss', 'push', 'miss']);
  });

  it('flips for unders and marks head-to-head games', () => {
    const { container } = render(<GameLogChart entries={entries} line={25} side="under" />);
    const bars = container.querySelectorAll('[data-result]');
    expect(bars[1]).toHaveAttribute('data-result', 'hit');
    expect(bars[1]).toHaveAttribute('data-h2h', 'true');
  });

  it('describes the chart and labels the line', () => {
    render(<GameLogChart entries={entries} line={25} side="over" statLabel="points" />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Bar chart of points in 4 games against a line of 25.0. 1 of 3 cleared it, 1 push.',
    );
    expect(screen.getAllByText('25.0').length).toBeGreaterThan(0);
  });

  it('says what to change when no games match', () => {
    render(<GameLogChart entries={[]} line={25} side="over" />);
    expect(screen.getByText('No games match these splits')).toBeInTheDocument();
  });
});
