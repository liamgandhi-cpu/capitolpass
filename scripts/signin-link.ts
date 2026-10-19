/**
 * Print a sign-in link for an existing account.
 *
 *   npm run signin:link demo.teacher@pwcs.edu
 *
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ----------------------------------------------------------------------------
 * In development the app surfaces sign-in links in the UI, because there is no
 * mail provider configured and the flow has to be walkable. That shortcut is
 * gated on NODE_ENV and is correctly OFF in a production build — a real
 * deployment must never hand out a session token to whoever loads the page.
 *
 * But a production build served on localhost still needs a way in. Rather than
 * loosen the gate, this script issues the link from the server side, where
 * having shell access already implies having the database. Same single-use,
 * 30-minute token the sign-in form would have emailed; it is just printed to a
 * terminal instead of an inbox.
 *
 * The other way in, with no script at all, is to read the outbox that every
 * unsent message is written to:
 *
 *   tail -n 30 data/outbox.log
 */

import { createMagicLink, findUserByEmail } from '../lib/auth';
import { siteUrl } from '../lib/mail';

const email = process.argv[2];

if (!email) {
  console.error('Usage: npm run signin:link <email>\n');
  console.error('Seeded demo accounts:');
  console.error('  demo.teacher@pwcs.edu         teacher, 34-person trip');
  console.error('  demo.teacher2@pwcs.edu        teacher, 14-person trip');
  console.error('  demo.staffer@mail.house.gov   congressional office queue');
  process.exit(1);
}

const user = findUserByEmail(email);
if (!user) {
  console.error(`No account for ${email}. Run \`npm run db:seed\` first.`);
  process.exit(1);
}

const token = createMagicLink({ email, purpose: 'signin' });

console.log(`\nSign-in link for ${email} (${user.role}):\n`);
console.log(`  ${siteUrl(`/signin/verify?token=${token}`)}\n`);
console.log('Single use. Expires in 30 minutes.\n');
