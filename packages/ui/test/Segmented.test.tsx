import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented } from '../src/components/Segmented';

const OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'over', label: 'Over' },
  { value: 'under', label: 'Under' },
];

describe('Segmented', () => {
  it('labels the group and sets aria-pressed from value', () => {
    const { rerender } = render(
      <Segmented options={OPTIONS} value="over" onChange={() => {}} label="Side" />,
    );
    expect(screen.getByRole('group', { name: 'Side' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Over' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'false');

    rerender(<Segmented options={OPTIONS} value="under" onChange={() => {}} label="Side" />);
    expect(screen.getByRole('button', { name: 'Over' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Under' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the picked value', () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTIONS} value="both" onChange={onChange} label="Side" />);
    fireEvent.click(screen.getByRole('button', { name: 'Under' }));
    expect(onChange).toHaveBeenCalledWith('under');
  });
});
