// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const css = readFileSync(`${SRC}tokens.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Custom properties declared in rules whose selector names the given theme. */
function themeVars(theme: 'light' | 'dark'): Set<string> {
  const names = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.replace(/\s|['"]/g, '');
    if (!selector.includes(`[data-theme=${theme}]`)) continue;
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:/g)) names.add(d[1]!);
  }
  return names;
}

describe('tokens.css', () => {
  const light = themeVars('light');
  const dark = themeVars('dark');

  it('defines a substantial token set for both themes', () => {
    expect(light.size).toBeGreaterThan(50);
    expect(dark.size).toBeGreaterThan(50);
  });

  it('defines the same variable names in light and dark', () => {
    expect([...dark].sort()).toEqual([...light].sort());
  });

  it('makes plain :root the light theme', () => {
    expect(css).toMatch(/:root\s*,[^{]*\[data-theme=['"]?light/);
  });

  it('includes the spec palette, heat scale and intro tokens', () => {
    for (const name of [
      '--brand',
      '--brandText',
      '--chrome',
      '--heading',
      '--bg',
      '--surface',
      '--ink',
      '--muted',
      '--line',
      '--miss',
      '--push',
      '--signal',
      '--danger',
      '--h0b',
      '--h0f',
      '--h4b',
      '--h4f',
      '--intro-bg',
      '--intro-rule',
      '--intro-up',
    ]) {
      expect(light.has(name), name).toBe(true);
    }
  });
});

describe('component styles', () => {
  const dir = `${SRC}components/`;
  const files = readdirSync(dir).filter((f) => /\.(css|tsx)$/.test(f));

  it('has components to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s has no hex color literals', (file) => {
    expect(readFileSync(dir + file, 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

/** Token values declared in the given theme's block. */
function themeValues(theme: 'light' | 'dark'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.replace(/\s|['"]/g, '');
    if (!selector.includes(`[data-theme=${theme}]`)) continue;
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[d[1]!] = d[2]!;
  }
  return out;
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('dark theme contrast (WCAG AA)', () => {
  const v = themeValues('dark');
  const text: Array<[string, string]> = [
    ['--ink', '--bg'],
    ['--ink', '--surface'],
    ['--ink', '--surface2'],
    ['--muted', '--bg'],
    ['--muted', '--surface'],
    ['--muted', '--surface2'],
    ['--heading', '--bg'],
    ['--onBrand', '--brand'],
    ['--brandText', '--bg'],
    ['--brandText', '--surface'],
    ['--chromeMuted', '--chrome'],
    ['--onChrome', '--chrome'],
    ['--segOnFg', '--segOn'],
    ['--badgeFg', '--badgeBg'],
    ['--gameOnFg', '--gameOnBg'],
    ['--toughFg', '--toughBg'],
    ['--dangerFg', '--dangerBg'],
    ['--signal', '--bg'],
    ['--signal', '--surface'],
    ['--danger', '--bg'],
    ['--danger', '--surface'],
    ['--h0f', '--h0b'],
    ['--h1f', '--h1b'],
    ['--h2f', '--h2b'],
    ['--h3f', '--h3b'],
    ['--h4f', '--h4b'],
    ['--ink', '--rowHover'],
    ['--ink', '--hoverBg'],
    ['--ink', '--favBg'],
  ];
  it.each(text)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(v[fg], fg).toBeDefined();
    expect(v[bg], bg).toBeDefined();
    expect(contrast(v[fg]!, v[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  const graphics: Array<[string, string]> = [
    ['--miss', '--bg'],
    ['--miss', '--surface'],
    ['--brand', '--bg'],
    ['--push', '--bg'],
  ];
  it.each(graphics)('%s on %s is at least 3:1 (graphics)', (fg, bg) => {
    expect(contrast(v[fg]!, v[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it('keeps a neutral (non-navy) dark ground', () => {
    for (const name of ['--bg', '--surface', '--surface2', '--chrome', '--intro-bg']) {
      const hex = v[name]!;
      const [r, , b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
      expect(b - r, name).toBeLessThanOrEqual(8);
    }
  });
});
