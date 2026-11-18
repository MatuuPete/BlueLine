// Auth.js endpoints: /api/auth/signin, /callback/<provider>, /session, /csrf, /signout.
import { handlers } from '../../../../auth';

export const { GET, POST } = handlers;
