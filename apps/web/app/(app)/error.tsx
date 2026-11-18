'use client';

import { Button, EmptyState } from '@blueline/ui';

/** Unexpected server error inside the app: say what happened and offer a retry. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: '48px var(--gutter)' }}
    >
      <EmptyState
        title="This page did not load"
        hint="The data request failed. Try again, and if it keeps failing, check the data status page."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
