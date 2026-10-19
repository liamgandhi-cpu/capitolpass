/**
 * The demo door hands out a session without proving anything. That is only safe
 * because of the guards in lib/auth/demo.ts, so the guards are tested rather
 * than assumed.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_PERSONAS, demoEnabled, findPersona, personaForEmail } from '../demo';

const original = process.env.CAPITOLPASS_DEMO;

afterEach(() => {
  if (original === undefined) delete process.env.CAPITOLPASS_DEMO;
  else process.env.CAPITOLPASS_DEMO = original;
});

describe('demoEnabled', () => {
  it('is off when the flag is unset', () => {
    delete process.env.CAPITOLPASS_DEMO;
    expect(demoEnabled()).toBe(false);
  });

  it('is on only for exactly "1"', () => {
    process.env.CAPITOLPASS_DEMO = '1';
    expect(demoEnabled()).toBe(true);

    // Anything else is off. A deployment that sets this to "true" or "yes" has
    // not opted in, and should get the closed door rather than a surprise.
    for (const value of ['0', 'true', 'yes', 'on', '', ' 1']) {
      process.env.CAPITOLPASS_DEMO = value;
      expect(demoEnabled(), `flag value ${JSON.stringify(value)}`).toBe(false);
    }
  });
});

describe('findPersona', () => {
  it('resolves each known key', () => {
    for (const persona of DEMO_PERSONAS) {
      expect(findPersona(persona.key)).toEqual(persona);
    }
  });

  it('refuses anything that is not a known key', () => {
    // The route takes a key, never an email — so none of these can resolve, and
    // there is no input shaped like "sign me in as someone else".
    const attempts = [
      null,
      undefined,
      '',
      'admin',
      '../../etc/passwd',
      'demo.teacher@pwcs.edu', // the email itself must not be a valid key
      'principal@pwcs.edu',
      'TEACHER',
    ];
    for (const attempt of attempts) {
      expect(findPersona(attempt), `key ${JSON.stringify(attempt)}`).toBeNull();
    }
  });
});

describe('personaForEmail', () => {
  it('resolves a seeded demo account when the flag is on', () => {
    process.env.CAPITOLPASS_DEMO = '1';
    expect(personaForEmail('demo.teacher@pwcs.edu')?.key).toBe('teacher');
    expect(personaForEmail('  DEMO.STAFFER@MAIL.HOUSE.GOV  ')?.key).toBe('staffer');
  });

  it('never marks a non-demo account as a demo persona', () => {
    process.env.CAPITOLPASS_DEMO = '1';
    expect(personaForEmail('real.teacher@pwcs.edu')).toBeNull();
    expect(personaForEmail(null)).toBeNull();
  });

  it('resolves nothing at all when the flag is off', () => {
    delete process.env.CAPITOLPASS_DEMO;
    // Otherwise a deployment that seeded a demo database and then closed the
    // door would still render the banner over real screens.
    expect(personaForEmail('demo.teacher@pwcs.edu')).toBeNull();
  });
});

describe('the persona list', () => {
  it('only ever points at seeded demo accounts', () => {
    // A persona pointing at a non-demo address would turn this into a real
    // account takeover. The local part must be demo.* by construction.
    for (const persona of DEMO_PERSONAS) {
      expect(persona.email.split('@')[0].startsWith('demo.'), persona.email).toBe(true);
    }
  });

  it('has unique keys', () => {
    const keys = DEMO_PERSONAS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lands every persona on an internal path', () => {
    for (const persona of DEMO_PERSONAS) {
      expect(persona.destination.startsWith('/'), persona.destination).toBe(true);
      expect(persona.destination.startsWith('//')).toBe(false);
    }
  });
});
