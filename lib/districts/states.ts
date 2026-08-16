/**
 * State and territory codes.
 *
 * The Census Geocoder answers in FIPS codes; the congress-legislators dataset
 * answers in USPS abbreviations. This table is the bridge, and it deliberately
 * includes the territories — DC, Puerto Rico, the Virgin Islands, Guam,
 * American Samoa and the Northern Mariana Islands all send a Delegate or
 * Resident Commissioner to the House, and those offices run constituent tours
 * exactly like any other. A school in San Juan is not an edge case to us.
 */

export interface StateRecord {
  fips: string;
  usps: string;
  name: string;
  /**
   * False for the territories, which have no Senators. The UI must not promise
   * a teacher two Senate offices that do not exist.
   */
  hasSenators: boolean;
  /** True where the House member is a Delegate or Resident Commissioner. */
  delegateOnly: boolean;
}

const RAW: Array<[fips: string, usps: string, name: string, hasSenators?: false, delegate?: true]> = [
  ['01', 'AL', 'Alabama'],
  ['02', 'AK', 'Alaska'],
  ['04', 'AZ', 'Arizona'],
  ['05', 'AR', 'Arkansas'],
  ['06', 'CA', 'California'],
  ['08', 'CO', 'Colorado'],
  ['09', 'CT', 'Connecticut'],
  ['10', 'DE', 'Delaware'],
  ['11', 'DC', 'District of Columbia', false, true],
  ['12', 'FL', 'Florida'],
  ['13', 'GA', 'Georgia'],
  ['15', 'HI', 'Hawaii'],
  ['16', 'ID', 'Idaho'],
  ['17', 'IL', 'Illinois'],
  ['18', 'IN', 'Indiana'],
  ['19', 'IA', 'Iowa'],
  ['20', 'KS', 'Kansas'],
  ['21', 'KY', 'Kentucky'],
  ['22', 'LA', 'Louisiana'],
  ['23', 'ME', 'Maine'],
  ['24', 'MD', 'Maryland'],
  ['25', 'MA', 'Massachusetts'],
  ['26', 'MI', 'Michigan'],
  ['27', 'MN', 'Minnesota'],
  ['28', 'MS', 'Mississippi'],
  ['29', 'MO', 'Missouri'],
  ['30', 'MT', 'Montana'],
  ['31', 'NE', 'Nebraska'],
  ['32', 'NV', 'Nevada'],
  ['33', 'NH', 'New Hampshire'],
  ['34', 'NJ', 'New Jersey'],
  ['35', 'NM', 'New Mexico'],
  ['36', 'NY', 'New York'],
  ['37', 'NC', 'North Carolina'],
  ['38', 'ND', 'North Dakota'],
  ['39', 'OH', 'Ohio'],
  ['40', 'OK', 'Oklahoma'],
  ['41', 'OR', 'Oregon'],
  ['42', 'PA', 'Pennsylvania'],
  ['44', 'RI', 'Rhode Island'],
  ['45', 'SC', 'South Carolina'],
  ['46', 'SD', 'South Dakota'],
  ['47', 'TN', 'Tennessee'],
  ['48', 'TX', 'Texas'],
  ['49', 'UT', 'Utah'],
  ['50', 'VT', 'Vermont'],
  ['51', 'VA', 'Virginia'],
  ['53', 'WA', 'Washington'],
  ['54', 'WV', 'West Virginia'],
  ['55', 'WI', 'Wisconsin'],
  ['56', 'WY', 'Wyoming'],
  ['60', 'AS', 'American Samoa', false, true],
  ['66', 'GU', 'Guam', false, true],
  ['69', 'MP', 'Northern Mariana Islands', false, true],
  ['72', 'PR', 'Puerto Rico', false, true],
  ['78', 'VI', 'U.S. Virgin Islands', false, true],
];

export const STATES: StateRecord[] = RAW.map(([fips, usps, name, hasSenators, delegate]) => ({
  fips,
  usps,
  name,
  hasSenators: hasSenators !== false,
  delegateOnly: delegate === true,
}));

const BY_FIPS = new Map(STATES.map((s) => [s.fips, s]));
const BY_USPS = new Map(STATES.map((s) => [s.usps, s]));

export function stateByFips(fips: string): StateRecord | undefined {
  return BY_FIPS.get(fips.padStart(2, '0'));
}

export function stateByUsps(usps: string): StateRecord | undefined {
  return BY_USPS.get(usps.toUpperCase());
}

/**
 * How to write a district for a human.
 *
 * `district: 0` means different things in different places — an at-large seat
 * in Wyoming, a Delegate in DC, a Resident Commissioner in Puerto Rico — and
 * calling all of them "District 0" would be wrong in every case.
 */
export function formatDistrict(usps: string, district: number): string {
  const state = stateByUsps(usps);
  if (!state) return `${usps}-${district}`;
  if (district === 0) {
    if (state.usps === 'PR') return 'Puerto Rico (Resident Commissioner)';
    if (state.delegateOnly) return `${state.name} (Delegate, at-large)`;
    return `${state.name} (at-large)`;
  }
  return `${state.usps}-${String(district).padStart(2, '0')}`;
}

/** Long form, for prose: "Virginia's 10th congressional district". */
export function describeDistrict(usps: string, district: number): string {
  const state = stateByUsps(usps);
  const name = state?.name ?? usps;
  if (district === 0) {
    if (state?.usps === 'PR') return `${name}, represented by a Resident Commissioner`;
    if (state?.delegateOnly) return `${name}, represented by a Delegate`;
    return `${name}'s at-large congressional district`;
  }
  return `${name}'s ${ordinal(district)} congressional district`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
