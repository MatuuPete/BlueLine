import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DefenseChip, defenseTone } from '../src/components/DefenseChip';

describe('defenseTone', () => {
  it('is favorable when an over faces a soft defense', () => {
    expect(defenseTone('worst', 'over')).toBe('favorable');
    expect(defenseTone('bad', 'over')).toBe('favorable');
  });

  it('is tough when an over faces a top defense', () => {
    expect(defenseTone('best', 'over')).toBe('tough');
  });

  it('mirrors for unders', () => {
    expect(defenseTone('best', 'under')).toBe('favorable');
    expect(defenseTone('good', 'under')).toBe('favorable');
    expect(defenseTone('worst', 'under')).toBe('tough');
  });

  it('is neutral otherwise', () => {
    expect(defenseTone('good', 'over')).toBe('neutral');
    expect(defenseTone('bad', 'under')).toBe('neutral');
  });
});

describe('DefenseChip', () => {
  it('renders favorable for over + worst with the tier and rank printed', () => {
    const { container } = render(<DefenseChip tier="worst" rank={28} position="G" side="over" />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'favorable');
    expect(screen.getByText('Worst')).toBeInTheDocument();
    expect(screen.getByText('28th vs G')).toBeInTheDocument();
  });

  it('renders tough for over + best', () => {
    const { container } = render(<DefenseChip tier="best" rank={2} position="C" side="over" />);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'tough');
    expect(screen.getByText('2nd vs C')).toBeInTheDocument();
  });
});
