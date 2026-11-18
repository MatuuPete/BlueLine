import { buttonClassName } from '@blueline/ui';
import type { Metadata } from 'next';
import { Standalone } from '../_ui/Standalone';

export const metadata: Metadata = { title: 'Offline' };
export const dynamic = 'force-static';

/** Served by the service worker when a page is requested offline. */
export default function OfflinePage() {
  return (
    <Standalone title="You are offline">
      <p>
        This page needs a connection. The last board you loaded is still readable from the board
        tab.
      </p>
      <a href="/" className={buttonClassName('primary')}>
        Open the last board
      </a>
    </Standalone>
  );
}
