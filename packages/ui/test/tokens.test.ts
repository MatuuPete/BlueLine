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
