import { ButtonLink } from '../../../../_ui/ButtonLink';
import { EmptyState } from '@blueline/ui';

export default function PropNotFound() {
  return (
    <div
      style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: '48px var(--gutter)' }}
    >
      <EmptyState
        title="This prop is not on the board"
        hint="The player, market or game was not found. Pick a prop from the board instead."
        action={
          <ButtonLink href="/" variant="primary">
            Back to the board
          </ButtonLink>
        }
      />
    </div>
  );
}
