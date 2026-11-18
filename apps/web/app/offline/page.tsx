import type { Metadata } from 'next';
import { ButtonLink } from '../_ui/ButtonLink';
import { Standalone } from '../_ui/Standalone';

export const metadata: Metadata = { title: 'Offline' };
export const dynamic = 'force-dynamic';

/** Served by the service worker when a page is requested offline. */
export default function OfflinePage() {
  return (
    <Standalone title="You are offline">
      <p>
        This page needs a connection. The last board you loaded is still readable from the board
        tab.
      </p>
      <ButtonLink href="/" prefetch={false}>
        Open the last board
      </ButtonLink>
    </Standalone>
  );
}
