import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Badge } from '../src/components/Badge';
import { Chip } from '../src/components/Chip';
import { Disclaimer } from '../src/components/Disclaimer';
import { EmptyState } from '../src/components/EmptyState';
import { Logo } from '../src/components/Logo';

describe('Disclaimer', () => {
  it('prints the responsible-gambling line', () => {
    const { container } = render(<Disclaimer />);
    expect(container).toHaveTextContent(
      'Research only, not betting advice. 21+. Gambling problem? Call 1-800-GAMBLER.',
    );
  });
});

describe('EmptyState', () => {
  it('says what to change and offers the action', () => {
    render(
      <EmptyState
        title="No props match these filters"
        hint="Lower the hit-rate floor or widen the price range."
        action={<button type="button">Reset filters</button>}
      />,
    );
    expect(screen.getByText('No props match these filters')).toBeInTheDocument();
    expect(screen.getByText(/lower the hit-rate floor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();
  });
});

describe('Chip', () => {
  it('reflects pressed state and clicks', () => {
    const onClick = vi.fn();
    render(
      <Chip pressed onClick={onClick}>
        PTS
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'PTS' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Badge', () => {
  it('defaults its text by tone and keeps book names as text', () => {
    render(
      <>
        <Badge tone="out" />
        <Badge tone="questionable" />
        <Badge tone="book">FD</Badge>
      </>,
    );
    expect(screen.getByText('Out')).toHaveAttribute('data-tone', 'out');
    expect(screen.getByText('Questionable')).toHaveAttribute('data-tone', 'questionable');
    expect(screen.getByText('FD')).toHaveAttribute('data-tone', 'book');
  });
});

describe('Logo', () => {
  it('is decorative unless labelled', () => {
    const { container, rerender } = render(<Logo />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(<Logo label="BlueLine" size={34} />);
    expect(screen.getByRole('img', { name: 'BlueLine' })).toHaveAttribute('width', '34');
  });
});
