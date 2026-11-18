import { describe, expect, it, vi } from 'vitest';
import { clearClientCaches, SW_SIGN_OUT_MESSAGE } from '../app/_auth/clear-client-caches';

describe('clearClientCaches', () => {
  it('deletes every Cache Storage cache and tells the service worker', async () => {
    const deleted: string[] = [];
    const postMessage = vi.fn();
    await clearClientCaches({
      caches: {
        keys: async () => ['blueline-pages-v1', 'blueline-static-v1'],
        delete: async (k: string) => {
          deleted.push(k);
          return true;
        },
      },
      serviceWorker: { controller: { postMessage } },
    });
    expect(deleted).toEqual(['blueline-pages-v1', 'blueline-static-v1']);
    expect(postMessage).toHaveBeenCalledWith(SW_SIGN_OUT_MESSAGE);
    expect(SW_SIGN_OUT_MESSAGE).toEqual({ type: 'SIGN_OUT' });
  });

  it('works without Cache Storage or a controlling service worker', async () => {
    await expect(clearClientCaches({})).resolves.toBeUndefined();
    await expect(
      clearClientCaches({ serviceWorker: { controller: null } }),
    ).resolves.toBeUndefined();
  });

  it('never blocks sign-out when cache cleanup fails', async () => {
    const postMessage = vi.fn();
    await expect(
      clearClientCaches({
        caches: {
          keys: async () => {
            throw new Error('SecurityError');
          },
          delete: async () => true,
        },
        serviceWorker: { controller: { postMessage } },
      }),
    ).resolves.toBeUndefined();
    expect(postMessage).toHaveBeenCalled();
  });
});
