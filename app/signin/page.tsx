import Link from 'next/link';
import { Button, Card, ErrorSummary, Field, InsetText, PageHeader, TextInput } from '@/components/ui';
import { requestSignInLink } from './actions';

const ERRORS: Record<string, string> = {
  invalid_email: 'Enter a valid email address.',
  expired: 'That sign-in link had expired. Here is a fresh one.',
  used: 'That sign-in link had already been used. Request another.',
  not_found: 'That sign-in link was not recognised. Request another.',
};

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="Sign in"
        lede="We email you a link. There is no password to forget, and nothing for us to leak."
      />

      {message ? <ErrorSummary errors={[message]} /> : null}

      <Card>
        <form action={requestSignInLink} className="space-y-6">
          <Field
            label="Your email address"
            name="email"
            required
            hint="Use your school-issued address if you have one — it is how we match your school and your congressional district."
          >
            <TextInput
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="you@yourschool.org"
            />
          </Field>

          <Button>Email me a sign-in link</Button>
        </form>
      </Card>

      <InsetText>
        <p className="font-bold text-ink-950">Congressional staff</p>
        <p className="mt-1 text-slate-600">
          If you work in a House or Senate office, <Link href="/office/claim">claim your office</Link>{' '}
          instead. You need an address on a house.gov or senate.gov domain.
        </p>
      </InsetText>

      <InsetText>
        <p className="font-bold text-ink-950">Students</p>
        <p className="mt-1 text-slate-600">
          You do not need an account. <Link href="/join">Join your trip with the six-character code</Link>{' '}
          your teacher gave you.
        </p>
      </InsetText>
    </div>
  );
}
