/**
 * Translation completeness.
 *
 * Key parity is already a compile-time guarantee — `StudentCopy` is derived
 * from the English object, so a missing Spanish key does not build. What the
 * type system cannot catch is a key that is *present* and still English,
 * because someone copied the English object as a starting point and stopped
 * halfway. That is the failure this file exists for: half-translated reads as
 * broken, and a reader who hits an English paragraph stops trusting the
 * paragraphs they could read.
 */

import { describe, expect, it } from 'vitest';
import { LOCALES, isLocale, localeFrom, pick, INTL_TAG, LOCALE_NAME } from '../index';
import { STUDENT_COPY, type StudentCopy } from '../student';

/** Every string in a copy object, flattened, with the path that produced it. */
function strings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') {
    // Call the interpolating entries with plausible arguments so their prose is
    // covered too — that is where a stray English sentence hides best.
    try {
      const produced = (value as (...args: unknown[]) => unknown)(45, 'X', 'Y', true);
      return typeof produced === 'string' ? [[path, produced]] : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) =>
      strings(v, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe('locale helpers', () => {
  it('accepts only known locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('falls back to English for anything unrecognised', () => {
    expect(localeFrom({ lang: 'es' })).toBe('es');
    expect(localeFrom({ lang: 'klingon' })).toBe('en');
    expect(localeFrom({})).toBe('en');
    expect(localeFrom(undefined)).toBe('en');
  });

  it('has a native name and an Intl tag for every locale', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_NAME[locale]).toBeTruthy();
      // Region matters: bare "es" gives a European date order, and this
      // audience reads US dates.
      expect(INTL_TAG[locale]).toMatch(/-US$/);
    }
  });
});

describe('student copy', () => {
  const en = pick(STUDENT_COPY, 'en');
  const es = pick(STUDENT_COPY, 'es');

  it('has an entry for every locale', () => {
    for (const locale of LOCALES) {
      expect(STUDENT_COPY[locale], locale).toBeDefined();
    }
  });

  it('has the same shape in both languages', () => {
    const enPaths = strings(en).map(([p]) => p);
    const esPaths = strings(es).map(([p]) => p);
    expect(esPaths).toEqual(enPaths);
  });

  it('leaves no English string sitting in the Spanish copy', () => {
    // `viewIn` is the deliberate exception: on the Spanish page it offers the
    // English one, so it is *supposed* to be in the other language.
    const exempt = new Set(['viewIn']);

    const enByPath = new Map(strings(en));
    const identical = strings(es).filter(
      ([path, value]) => !exempt.has(path) && enByPath.get(path) === value,
    );

    expect(identical.map(([path]) => path)).toEqual([]);
  });

  it('interpolates the number it is given', () => {
    expect(en.screening(45)).toContain('45');
    expect(es.screening(45)).toContain('45');
    expect(es.walkMinutes(10)).toContain('10');
  });

  it('keeps the emphasis markers paired', () => {
    // components/i18n.tsx splits on a **…** pair. An odd number of markers
    // would render an asterisk to a family.
    for (const locale of LOCALES) {
      for (const [path, value] of strings(pick(STUDENT_COPY, locale))) {
        const markers = value.match(/\*\*/g)?.length ?? 0;
        expect(markers % 2, `${locale} ${path}`).toBe(0);
      }
    }
  });

  it('translates the civics section rather than leaving the terms in English', () => {
    const copy: StudentCopy = es;
    expect(copy.civics).toHaveLength(en.civics.length);
    for (let i = 0; i < copy.civics.length; i += 1) {
      expect(copy.civics[i].term).not.toBe(en.civics[i].term);
      expect(copy.civics[i].description).not.toBe(en.civics[i].description);
    }
  });
});
