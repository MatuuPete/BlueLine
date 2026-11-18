import { BUILT_IN_PRESETS, DEFAULT_BOARD_FILTER } from '@blueline/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FilterRail } from '../app/(app)/_components/FilterRail';
import { FilterSheet } from '../app/(app)/_components/FilterSheet';
import { PresetBar } from '../app/(app)/_components/PresetBar';
import { QuickFilters } from '../app/(app)/_components/QuickFilters';

const noop = vi.fn();
const props = { value: DEFAULT_BOARD_FILTER, onChange: noop, presets: [] };

describe('filter components (server render smoke)', () => {
  it('FilterRail renders every spec 6a group', () => {
    const html = renderToStaticMarkup(<FilterRail {...props} />);
    for (const g of [
      'Scope',
      'Market',
      'Hit rate',
      'Best price',
      'Opponent defense vs position',
      'Situation',
      'Role',
      'Health',
      'Market moves',
      'Sort',
      'Presets',
      'Reset filters',
    ]) {
      expect(html).toContain(g);
    }
  });
  it('PresetBar shows built-ins plus user presets', () => {
    const html = renderToStaticMarkup(
      <PresetBar
        {...props}
        presets={[{ id: 'u1', name: 'My preset', filter: { side: 'over' } }]}
      />,
    );
    for (const p of BUILT_IN_PRESETS) expect(html).toContain(p.name);
    expect(html).toContain('My preset');
  });
  it('QuickFilters shows the chips and the active count', () => {
    const html = renderToStaticMarkup(
      <QuickFilters
        value={{ ...DEFAULT_BOARD_FILTER, side: 'over', minHitRate: 70 }}
        onChange={noop}
        onOpenFilters={noop}
      />,
    );
    for (const t of ['Filters', 'L10 70%+', 'Overs', 'Soft matchups', 'Teammate out']) {
      expect(html).toContain(t);
    }
    expect(html).toContain('2 active filters');
  });
  it('FilterSheet is a modal dialog with a Show N props button; renders nothing when closed', () => {
    const open = renderToStaticMarkup(
      <FilterSheet {...props} open onClose={noop} resultCount={12} />,
    );
    expect(open).toContain('role="dialog"');
    expect(open).toContain('aria-modal="true"');
    expect(open).toContain('Show 12 props');
    expect(
      renderToStaticMarkup(<FilterSheet {...props} open onClose={noop} resultCount={1} />),
    ).toContain('Show 1 prop<');
    expect(
      renderToStaticMarkup(<FilterSheet {...props} open={false} onClose={noop} resultCount={3} />),
    ).toBe('');
  });
});
