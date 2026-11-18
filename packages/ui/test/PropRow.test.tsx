import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropCard } from '../src/components/PropCard';
import { PropRowView } from '../src/components/PropRowView';
import { PropTable } from '../src/components/PropTable';
import { makeRow } from './fixtures';

function renderRow(props: Partial<Parameters<typeof PropRowView>[0]> = {}) {
  const onToggleFavorite = vi.fn();
  const onToggleSlip = vi.fn();
  render(
    <PropTable label="Props">
      <PropRowView
        row={makeRow()}
        favorite={false}
        inSlip={false}
        onToggleFavorite={onToggleFavorite}
        onToggleSlip={onToggleSlip}
        activeWindow="l10"
        {...props}
      />
    </PropTable>,
  );
  return { onToggleFavorite, onToggleSlip };
}

describe('PropRowView', () => {
  it('renders the 13 board columns inside an ARIA table', () => {
    renderRow();
    const table = screen.getByRole('table', { name: 'Props' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(13);
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getAllByRole('cell')).toHaveLength(13);
  });

  it('prints the prop, price, edge and matchup', () => {
    renderRow();
    expect(screen.getByText('Marcus Dell')).toBeInTheDocument();
    expect(screen.getByText('O 24.5')).toBeInTheDocument();
    expect(screen.getByText('−115')).toBeInTheDocument();
    expect(screen.getByText('FD')).toBeInTheDocument();
    expect(screen.getByText('+2.5')).toBeInTheDocument();
    expect(screen.getByText('22nd vs G')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Marcus Dell: cleared the line in 8 of the last 10 games',
    );
  });

  it('rings only the active window', () => {
    const { container } = render(
      <PropRowView
        row={makeRow()}
        favorite={false}
        inSlip={false}
        onToggleFavorite={() => {}}
        onToggleSlip={() => {}}
        activeWindow="l20"
      />,
    );
    const active = container.querySelectorAll('[data-active="true"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent('75%');
  });

  it('toggles favorite and slip with named, pressed buttons', () => {
    const { onToggleFavorite, onToggleSlip } = renderRow({ inSlip: true });
    const fav = screen.getByRole('button', { name: /save marcus dell pts over to favorites/i });
    expect(fav).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(fav);
    expect(onToggleFavorite).toHaveBeenCalledOnce();

    const slip = screen.getByRole('button', {
      name: /remove marcus dell over 24.5 pts from slip/i,
    });
    expect(slip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(slip);
    expect(onToggleSlip).toHaveBeenCalledOnce();
  });

  it('shows injury and teammate-out context', () => {
    renderRow({
      row: makeRow({
        injuryStatus: 'questionable',
        teammateOut: true,
        teammatesOut: [{ playerId: 'p9', name: 'Kai Price', status: 'out', minutes: 30 }],
      }),
    });
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('K. Price out')).toBeInTheDocument();
  });

  it('prints dashes when price, edge and matchup are missing', () => {
    renderRow({
      row: makeRow({
        bestPrice: null,
        bestBook: null,
        edgeAvg: null,
        dvpRank: null,
        dvpTier: null,
      }),
    });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });
});

describe('PropCard', () => {
  it('renders a phone card with labelled heat cells and the slip button', () => {
    const onToggleSlip = vi.fn();
    render(
      <PropCard
        row={makeRow()}
        favorite
        inSlip={false}
        onToggleFavorite={() => {}}
        onToggleSlip={onToggleSlip}
        activeWindow="l10"
      />,
    );
    const card = screen.getByRole('article');
    expect(within(card).getByText('SZN')).toBeInTheDocument();
    expect(within(card).getByText('Bad D · 22')).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: /remove marcus dell pts over from favorites/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(
      within(card).getByRole('button', { name: /add marcus dell over 24.5 pts to slip/i }),
    );
    expect(onToggleSlip).toHaveBeenCalledOnce();
  });
});
