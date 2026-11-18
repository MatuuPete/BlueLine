import type { Metadata } from 'next';
import { Standalone } from '../_ui/Standalone';

export const metadata: Metadata = { title: 'Sign in' };

// Placeholder: Task 13 replaces this page with Auth.js sign-in.
export default function SignInPage() {
  return (
    <Standalone title="Sign in">
      <p>Sign-in arrives with the next release. For local development, start the app with
        AUTH_DEV_BYPASS=1.</p>
    </Standalone>
  );
}
