import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, TeamLogo } from '../src/components/Avatar';
import { headshotUrl, IMAGE_ORIGIN, teamLogoUrl } from '../src/images';
import { monogram } from '../src/format';

describe('image URLs', () => {
  it('builds a resized ESPN headshot from a p<espnId> player id', () => {
    expect(headshotUrl('p1966', 36)).toBe(
      `${IMAGE_ORIGIN}/combiner/i?img=/i/headshots/nba/players/full/1966.png&w=72&h=72&scale=crop`,
    );
  });
  it('returns null for ids without an ESPN number (fixtures, odd ids)', () => {
    expect(headshotUrl('marcus-dell', 36)).toBeNull();
    expect(headshotUrl('p', 36)).toBeNull();
    expect(headshotUrl('p12a', 36)).toBeNull();
  });
  it('builds a resized ESPN team logo from the ESPN abbreviation, lower-cased', () => {
    expect(teamLogoUrl('UTAH', 18)).toBe(
      `${IMAGE_ORIGIN}/combiner/i?img=/i/teamlogos/nba/500/utah.png&w=36&h=36`,
    );
    expect(teamLogoUrl('GS', 20)).toContain('/i/teamlogos/nba/500/gs.png');
  });
  it('rejects abbreviations that could not be an ESPN team', () => {
    expect(teamLogoUrl('', 18)).toBeNull();
    expect(teamLogoUrl('../x', 18)).toBeNull();
    expect(teamLogoUrl('TOOLONG', 18)).toBeNull();
  });
  it('the CDN origin is the one the CSP allows', () => {
    expect(IMAGE_ORIGIN).toBe('https://a.espncdn.com');
  });
});

describe('monogram', () => {
  it('first and last initials, ignoring suffixes', () => {
    expect(monogram('Marcus Dell')).toBe('MD');
    expect(monogram('Nene')).toBe('NE');
    expect(monogram('Karl-Anthony Towns Jr.')).toBe('KT');
    expect(monogram('   ')).toBe('?');
  });
});

describe('Avatar', () => {
  it('renders a lazy, no-referrer image and hides the fallback text', () => {
    const { container } = render(
      <Avatar src="https://a.espncdn.com/x.png" fallback="LJ" size={36} />,
    );
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://a.espncdn.com/x.png');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('alt', '');
    expect(container.firstElementChild).toHaveAttribute('data-state', 'image');
    expect(container.textContent).toBe('');
  });

  it('is decorative: the name next to it is the accessible text', () => {
    const { container } = render(<Avatar src={null} fallback="LJ" size={36} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the fallback text when there is no image', () => {
    const { container } = render(<Avatar src={null} fallback="LJ" size={36} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('LJ');
    expect(container.firstElementChild).toHaveAttribute('data-state', 'fallback');
  });

  it('falls back when the image fails to load (404 headshot)', () => {
    const { container } = render(
      <Avatar src="https://a.espncdn.com/missing.png" fallback="MB" size={36} />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('MB');
  });

  /** Stub img.complete / img.currentSrc for one render (jsdom never loads images). */
  function withImageState(state: { complete: boolean; currentSrc: string }, run: () => void) {
    const proto = HTMLImageElement.prototype;
    const saved = (['complete', 'currentSrc'] as const).map(
      (k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const,
    );
    Object.defineProperty(proto, 'complete', { configurable: true, get: () => state.complete });
    Object.defineProperty(proto, 'currentSrc', { configurable: true, get: () => state.currentSrc });
    try {
      run();
    } finally {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(proto, k, d);
        else delete (proto as unknown as Record<string, unknown>)[k];
      }
    }
  }

  it('falls back when the image had already failed before hydration', () => {
    // Requested, complete, no pixels: a load that failed before React attached onError.
    withImageState({ complete: true, currentSrc: 'https://a.espncdn.com/gone.png' }, () => {
      const { container } = render(
        <Avatar src="https://a.espncdn.com/gone.png" fallback="PG" size={36} />,
      );
      expect(container.textContent).toBe('PG');
    });
  });

  it('leaves a lazy image that has not been requested yet alone', () => {
    // Some browsers report an untouched lazy image as complete; currentSrc is still ''.
    withImageState({ complete: true, currentSrc: '' }, () => {
      const { container } = render(
        <Avatar src="https://a.espncdn.com/later.png" fallback="KT" size={36} />,
      );
      expect(container.querySelector('img')).not.toBeNull();
    });
  });

  it('tries again when the src changes after a failure', () => {
    const { container, rerender } = render(
      <Avatar src="https://a.espncdn.com/a.png" fallback="AA" size={36} />,
    );
    fireEvent.error(container.querySelector('img')!);
    rerender(<Avatar src="https://a.espncdn.com/b.png" fallback="BB" size={36} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://a.espncdn.com/b.png');
  });

  it('sizes the frame and uses contain for logos', () => {
    const { container } = render(
      <Avatar src="https://a.espncdn.com/gs.png" fallback="GS" size={18} variant="logo" />,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('18px');
    expect(frame.style.height).toBe('18px');
    expect(frame).toHaveAttribute('data-variant', 'logo');
  });
});

describe('TeamLogo', () => {
  it('renders the ESPN logo for the abbreviation', () => {
    const { container } = render(<TeamLogo abbr="MEM" size={18} />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      '/teamlogos/nba/500/mem.png',
    );
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'logo');
  });
  it('falls back to the abbreviation when the logo fails', () => {
    const { container } = render(<TeamLogo abbr="SA" size={18} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.textContent).toBe('SA');
  });
});
