import { afterAll, beforeAll, vi } from 'vitest';

// Tests never touch the network: any stray global fetch throws.
beforeAll(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network access is not allowed in tests');
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
});
