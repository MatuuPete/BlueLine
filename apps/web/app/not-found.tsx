import type { Metadata } from 'next';
import { ButtonLink } from './_ui/ButtonLink';
import { Standalone } from './_ui/Standalone';

export const metadata: Metadata = { title: 'Page not found' };

/** Any unknown URL. The Standalone frame carries the responsible-gambling line. */
export default function NotFound() {
  return (
    <Standalone title="Page not found">
      <p>This address does not match a page. Check the link, or start from the board.</p>
      <ButtonLink href="/">Go to the board</ButtonLink>
    </Standalone>
  );
}
