import Link from 'next/link';
import { PageHeader, Panel } from '@/components/ui';

export const metadata = { title: 'Confirm your office account' };

export default async function ClaimSentPage({
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
              A confirmation link is on its way to <strong>{email}</strong>. It works once and
              expires in 30 minutes.
            </>
          ) : (
            'A confirmation link is on its way.'
          )
        }
      />

      {showDevLink ? (
        <Panel title="Development mode — no mail provider configured" tone="warn">
          <p>Nothing was actually emailed. Continue with the link below.</p>
          <p className="mt-3">
            <Link href={`/office/claim/verify?token=${devToken}`} className="font-bold">
              Confirm the office account →
            </Link>
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
