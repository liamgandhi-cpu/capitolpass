import { redirect } from 'next/navigation';
import { Button, Card, ErrorSummary, Field, PageHeader, TextInput } from '@/components/ui';
import { getTripByJoinCode } from '@/lib/trips';

export const metadata = { title: 'Join a trip' };

async function joinTrip(formData: FormData) {
  'use server';
  const code = String(formData.get('code') ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (code.length !== 6) redirect('/join?error=format');
  if (!getTripByJoinCode(code)) redirect('/join?error=not_found');

  redirect(`/trip/${code}`);
}

const ERRORS: Record<string, string> = {
  format: 'A trip code is six characters — letters and numbers, no spaces.',
  not_found: 'No trip has that code. Check it with your teacher — it is easy to misread an O for a 0.',
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="Join your trip"
        lede="Enter the six-character code your teacher gave you. You do not need an account."
      />

      {message ? <ErrorSummary errors={[message]} /> : null}

      <Card>
        <form action={joinTrip} className="space-y-6">
          <Field
            label="Trip code"
            name="code"
            required
            hint="Six characters. We leave out letters and numbers that look alike, so there is no O, I, L, 0, 1 or 5."
          >
            <TextInput
              name="code"
              required
              maxLength={8}
              autoComplete="off"
              placeholder="ABC123"
            />
          </Field>

          <Button>Find my trip</Button>
        </form>
      </Card>
    </div>
  );
}
