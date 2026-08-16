import { describe, expect, it } from 'vitest';
import { parseDistrictCode, districtByCoordinates, DistrictLookupError } from '../census';
import { describeDistrict, formatDistrict, stateByFips, stateByUsps, STATES } from '../states';

/**
 * District resolution splits into two kinds of test.
 *
 * The pure ones run always: parsing Census GEOIDs and writing districts for
 * humans. These are where the subtle bugs live, because "district 0" means
 * three different things depending on where you are.
 *
 * The network ones hit the live US Census Geocoder and are gated behind
 * NETWORK_TESTS=1, so `npm test` stays fast and offline-safe. They are the ones
 * that actually prove border resolution works:
 *
 *   NETWORK_TESTS=1 npm test
 */

// ---------------------------------------------------------------------------
// GEOID parsing
// ---------------------------------------------------------------------------

describe('parsing the district half of a Census GEOID', () => {
  it('reads an ordinary numbered district', () => {
    expect(parseDistrictCode('10')).toBe(10);
    expect(parseDistrictCode('01')).toBe(1);
    expect(parseDistrictCode('34')).toBe(34);
  });

  it('maps an at-large district to 0, matching the legislators dataset', () => {
    // Wyoming, North Dakota, Alaska et al. come back as GEOID SS00.
    expect(parseDistrictCode('00')).toBe(0);
  });

  it('maps a delegate district to 0 as well', () => {
    // Census encodes DC's Delegate and Puerto Rico's Resident Commissioner as
    // 98. congress-legislators files both under district 0, so we normalise
    // here and nothing downstream has to know about the 98.
    expect(parseDistrictCode('98')).toBe(0);
  });

  it('rejects something it does not recognise rather than guessing', () => {
    expect(() => parseDistrictCode('ZZ')).toThrow(DistrictLookupError);
  });
});

// ---------------------------------------------------------------------------
// States and territories
// ---------------------------------------------------------------------------

describe('state lookup', () => {
  it('bridges Census FIPS codes to the USPS codes the legislators data uses', () => {
    expect(stateByFips('51')?.usps).toBe('VA');
    expect(stateByFips('06')?.usps).toBe('CA');
    expect(stateByFips('6')?.usps).toBe('CA'); // unpadded input still works
    expect(stateByFips('72')?.usps).toBe('PR');
  });

  it('knows which places have no Senators', () => {
    expect(stateByUsps('VA')?.hasSenators).toBe(true);
    for (const territory of ['DC', 'PR', 'VI', 'GU', 'AS', 'MP']) {
      expect(stateByUsps(territory)?.hasSenators).toBe(false);
    }
  });

  it('covers all 50 states plus DC and the five territories', () => {
    expect(STATES).toHaveLength(56);
  });
});

describe('writing a district for a human', () => {
  it('writes an ordinary district as a padded code', () => {
    expect(formatDistrict('VA', 10)).toBe('VA-10');
    expect(formatDistrict('CA', 3)).toBe('CA-03');
  });

  it('never writes "District 0", which would be wrong everywhere it appears', () => {
    expect(formatDistrict('WY', 0)).toBe('Wyoming (at-large)');
    expect(formatDistrict('DC', 0)).toBe('District of Columbia (Delegate, at-large)');
    expect(formatDistrict('PR', 0)).toBe('Puerto Rico (Resident Commissioner)');

    for (const usps of ['WY', 'DC', 'PR', 'AK', 'GU']) {
      expect(formatDistrict(usps, 0)).not.toMatch(/-0+$/);
    }
  });

  it('uses correct ordinals in prose', () => {
    expect(describeDistrict('VA', 10)).toBe("Virginia's 10th congressional district");
    expect(describeDistrict('CA', 1)).toBe("California's 1st congressional district");
    expect(describeDistrict('NY', 2)).toBe("New York's 2nd congressional district");
    expect(describeDistrict('TX', 3)).toBe("Texas's 3rd congressional district");
    expect(describeDistrict('FL', 11)).toBe("Florida's 11th congressional district");
    expect(describeDistrict('FL', 12)).toBe("Florida's 12th congressional district");
    expect(describeDistrict('FL', 13)).toBe("Florida's 13th congressional district");
    expect(describeDistrict('FL', 21)).toBe("Florida's 21st congressional district");
  });
});

// ---------------------------------------------------------------------------
// Live geocoder — the border cases
// ---------------------------------------------------------------------------

const online = process.env.NETWORK_TESTS === '1';

describe.skipIf(!online)('live Census Geocoder', () => {
  it('resolves an ordinary point', { timeout: 30_000 }, async () => {
    // Loudoun County, Virginia.
    const result = await districtByCoordinates(39.0437, -77.5636);
    expect(result.state.usps).toBe('VA');
    expect(result.district).toBe(10);
    expect(result.method).toBe('coordinates');
  });

  it('resolves at-large states to district 0', { timeout: 30_000 }, async () => {
    const wyoming = await districtByCoordinates(41.14, -104.8202);
    expect(wyoming.state.usps).toBe('WY');
    expect(wyoming.district).toBe(0);
  });

  it('resolves DC to its Delegate district, not a numbered one', { timeout: 30_000 }, async () => {
    const dc = await districtByCoordinates(38.9072, -77.0369);
    expect(dc.state.usps).toBe('DC');
    expect(dc.district).toBe(0);
    expect(dc.state.hasSenators).toBe(false);
  });

  /**
   * The case that matters most.
   *
   * Two points a short distance apart, on opposite sides of a district line,
   * have to resolve differently. This is exactly where a ZIP-code lookup would
   * give the same answer for both and send one school's request to an office
   * that will correctly ignore it.
   */
  it(
    'distinguishes two nearby points that sit in different districts',
    { timeout: 40_000 },
    async () => {
      // Both in northern Virginia, roughly 25km apart, either side of the
      // VA-10 / VA-11 boundary.
      const westerly = await districtByCoordinates(39.0437, -77.5636); // Loudoun
      const easterly = await districtByCoordinates(38.8462, -77.3064); // Fairfax

      expect(westerly.state.usps).toBe('VA');
      expect(easterly.state.usps).toBe('VA');
      expect(westerly.district).not.toBe(easterly.district);
    },
  );

  it('refuses a point outside the United States', { timeout: 30_000 }, async () => {
    // Mid-Atlantic.
    await expect(districtByCoordinates(35.0, -40.0)).rejects.toThrow(DistrictLookupError);
  });
});
