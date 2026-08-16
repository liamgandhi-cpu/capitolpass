import Link from 'next/link';
import { Card, PageHeader, Panel } from '@/components/ui';

export const metadata = { title: 'Check your email' };

/**
 * After requesting a sign-in link.
 *
 * With no mail provider configured — the default for local development and for
 * anyone evaluating this project — the link is shown here directly so the flow
 * can be walked end to end. That shortcut is gated on NODE_ENV and the token is
 * only ever passed through when the server itself put it in the URL.
 */
export default async function LinkSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; dev_token?: string }>;
}) {
  const { email, dev_token: devToken } = await searchParams;
  const showDevLink = process.env.NODE_ENV !== 'production' && devToken;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="Check your email"
        lede={
          email ? (
            <>
              If <strong>{email}</strong> has an account, a sign-in link is on its way. It works once
              and expires in 30 minutes.
            </>
          ) : (
            'If that address has an account, a sign-in link is on its way.'
          )
        }
      />

      {showDevLink ? (
        <Panel title="Development mode — no mail provider configured" tone="warn">
          <p>
            No <code className="font-mono text-sm">RESEND_API_KEY</code> is set, so nothing was
            actually emailed. The message was written to{' '}
            <code className="font-mono text-sm">data/outbox.log</code> and printed to the server
            console. Use the link below to continue.
          </p>
          <p className="mt-3">
            <Link href={`/signin/verify?token=${devToken}`} className="font-bold">
              Continue signing in →
            </Link>
          </p>
        </Panel>
      ) : null}

      <Card>
        <h2 className="text-lg font-bold">Nothing arriving?</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          <li>School mail filters are aggressive. Check spam and quarantine.</li>
          <li>Make sure you used the address you signed up with.</li>
          <li>
            <Link href="/signin">Request a fresh link</Link> — the old one stops working as soon as a
            new one is issued.
          </li>
        </ul>
      </Card>
    </div>
  );
}
