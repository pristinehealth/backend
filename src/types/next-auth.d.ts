/**
 * Module augmentation for next-auth so the custom fields our callbacks attach
 * (see src/app/api/auth/[...nextauth]/route.ts) are visible to TypeScript.
 *
 * The credentials `authorize()` returns `{ id, role }`, the `jwt` callback
 * copies them onto the token, and the `session` callback copies them onto
 * `session.user`. Without this augmentation, `session.user.role` /
 * `session.user.id` are typed away and every admin route that reads them
 * fails `tsc`.
 */
import type { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string;
      role?: string;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
  }
}
