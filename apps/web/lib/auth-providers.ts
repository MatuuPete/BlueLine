// Which OAuth providers are configured. A provider is on only when both its client ID and
// secret are set (AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET), so the app can be deployed
// first and given OAuth credentials later. Pure: no next-auth import, safe in any runtime.

export interface ConfiguredProviders {
  github: boolean;
  google: boolean;
}

function set(value: string | undefined): boolean {
  return (value?.trim() ?? '').length > 0;
}

export function configuredProviders(env: Record<string, string | undefined> = process.env): ConfiguredProviders {
  return {
    github: set(env.AUTH_GITHUB_ID) && set(env.AUTH_GITHUB_SECRET),
    google: set(env.AUTH_GOOGLE_ID) && set(env.AUTH_GOOGLE_SECRET),
  };
}
