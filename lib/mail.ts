/**
 * Transactional email.
 *
 * ----------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ----------------------------------------------------------------------------
 * This module never sends anything to a congressional office. Not a tour
 * request, not a meeting request, not a follow-up. Automated mail to
 * .house.gov and .senate.gov addresses gets filtered, wastes the time of people
 * whose inboxes are a public resource, and would make this project a nuisance
 * rather than a tool.
 *
 * Requests reach offices in exactly three ways, all of which keep a human in
 * the loop (see lib/packets):
 *
 *   1. The teacher pastes the packet into the office's own web form.
 *   2. The teacher sends it from their own mailbox, as themselves.
 *   3. It lands in the office's in-app queue, because that office chose to
 *      claim their account and receive requests that way.
 *
 * What this module does send: sign-in links, administrator co-sign links, and
 * office claim confirmations. All to people who just asked for them.
 *
 * ----------------------------------------------------------------------------
 * DELIVERY
 * ----------------------------------------------------------------------------
 * With RESEND_API_KEY set, mail goes out through Resend. Without it — which is
 * the default for local development and for anyone evaluating this project —
 * mail is written to data/outbox.log and the link is surfaced directly in the
 * UI so the flow can be walked end to end with no email provider at all.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface Message {
  to: string;
  subject: string;
  /** Plain text. We do not send HTML mail; these are short, functional notes. */
  body: string;
}

export type DeliveryResult =
  | { delivered: true; via: 'resend' }
  | { delivered: false; via: 'outbox'; reason: string };

function outboxPath(): string {
  return path.join(process.cwd(), 'data', 'outbox.log');
}

async function writeToOutbox(message: Message, reason: string): Promise<DeliveryResult> {
  const entry =
    `\n${'='.repeat(72)}\n` +
    `AT:      ${new Date().toISOString()}\n` +
    `TO:      ${message.to}\n` +
    `SUBJECT: ${message.subject}\n` +
    `REASON:  ${reason}\n` +
    `${'-'.repeat(72)}\n${message.body}\n`;

  try {
    await mkdir(path.dirname(outboxPath()), { recursive: true });
    await appendFile(outboxPath(), entry, 'utf8');
  } catch {
    // If we cannot even write the outbox, the console is still something.
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(entry);
  }

  return { delivered: false, via: 'outbox', reason };
}

export async function sendMail(message: Message): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    return writeToOutbox(
      message,
      'No RESEND_API_KEY / MAIL_FROM configured — written to the local outbox instead.',
    );
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return writeToOutbox(message, `Resend returned HTTP ${res.status}. ${detail.slice(0, 200)}`);
    }

    return { delivered: true, via: 'resend' };
  } catch (err) {
    return writeToOutbox(message, `Could not reach Resend: ${(err as Error).message}`);
  }
}

/** Absolute URL for links in email. */
export function siteUrl(pathname = '/'): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return new URL(pathname, base).toString();
}

// ---------------------------------------------------------------------------
// The messages we actually send
// ---------------------------------------------------------------------------

export function signInMessage(to: string, token: string): Message {
  return {
    to,
    subject: 'Your CapitolPass sign-in link',
    body: [
      'Someone asked to sign in to CapitolPass with this email address.',
      '',
      siteUrl(`/signin/verify?token=${token}`),
      '',
      'The link works once and expires in 30 minutes.',
      'If this was not you, you can ignore this email — nothing has changed.',
    ].join('\n'),
  };
}

export function coSignMessage(input: {
  to: string;
  teacherName: string;
  schoolName: string;
  tripTitle: string;
  token: string;
}): Message {
  return {
    to: input.to,
    subject: `Confirm a Capitol trip for ${input.schoolName}`,
    body: [
      `${input.teacherName} is planning a trip to the US Capitol and listed you as the`,
      'administrator who can confirm it.',
      '',
      `Trip:   ${input.tripTitle}`,
      `School: ${input.schoolName}`,
      '',
      'Confirming tells congressional offices that this is a real school group from',
      'a real school. It takes one click and you do not need an account:',
      '',
      siteUrl(`/cosign?token=${input.token}`),
      '',
      'The link expires in 30 minutes. If you do not recognise this request, ignore',
      'this email and the trip stays unverified.',
    ].join('\n'),
  };
}

export function officeClaimMessage(input: { to: string; officeName: string; token: string }): Message {
  return {
    to: input.to,
    subject: `Confirm your CapitolPass account for ${input.officeName}`,
    body: [
      `Someone requested a CapitolPass staff account for ${input.officeName}`,
      'using this address.',
      '',
      'Confirm it here:',
      siteUrl(`/office/claim/verify?token=${input.token}`),
      '',
      'CapitolPass gives your office a queue of school tour requests from verified',
      'constituent schools, with a weekly capacity tracker. You can confirm,',
      'decline, or propose a different date without leaving the queue.',
      '',
      'The link expires in 30 minutes.',
    ].join('\n'),
  };
}
