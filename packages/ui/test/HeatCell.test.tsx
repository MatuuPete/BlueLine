import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeatCell } from '../src/components/HeatCell';

describe('HeatCell', () => {
  it.each([
    [39, 0],
    [40, 1],
    [54, 1],
    [55, 2],
    [69, 2],
    [70, 3],
    [84, 3],
    [85, 4],
    [100, 4],
  ])('puts %i of 100 in bucket %i', (hits, bucket) => {
    const { container } = render(<HeatCell hits={hits} n={100} />);
    expect(container.querySelector('[data-bucket]')).toHaveAttribute('data-bucket', String(bucket));
  });

  it('prints the percentage and the hits/n fraction', () => {
    render(<HeatCell hits={8} n={10} />);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });

  it('shows a dash when there is no sample', () => {
    const { container } = render(<HeatCell hits={0} n={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(container.querySelector('[data-bucket]')).toHaveAttribute('data-bucket', 'none');
  });

  it('prints its label and marks the active window', () => {
    const { container } = render(<HeatCell hits={7} n={10} label="L10" active />);
    expect(screen.getByText('L10')).toBeInTheDocument();
    expect(container.querySelector('[data-bucket]')).toHaveAttribute('data-active', 'true');
  });
});
