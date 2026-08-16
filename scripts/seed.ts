/**
 * Seed the database for a demo.
 *
 *   npm run db:seed
 *
 * Creates: office records for every current member, a lunch venue directory,
 * one claimed congressional office with a staff account, and two teacher
 * accounts with trips at different stages — one small enough for a staff-led
 * tour, one too big, which is the comparison the whole product is built around.
 *
 * ----------------------------------------------------------------------------
 * WHAT IS REAL AND WHAT IS NOT
 * ----------------------------------------------------------------------------
 * Real: the schools (NCES CCD), the members and their offices
 * (congress-legislators), the districts (US Census Geocoder), and the venue
 * names and addresses.
 *
 * Not real: the teacher and staff accounts, and the trips. They are obviously
 * fictional and named as such.
 *
 * Deliberately empty: `is_partner` is 0 on every venue, and partner_leads
 * starts empty. There are no restaurant partnerships, so there are no partner
 * tags. Where a group policy or price is not something we could confirm from a
 * public source, the column is NULL and the UI says "call to confirm" rather
 * than showing a number we made up.
 */

import { all, get, newId, nowIso, run, transaction } from '../lib/db';
import { migrate } from '../lib/db';
import { ensureOfficesExist, approveOfficeClaim, officeByBioguide, requestOfficeClaim } from '../lib/offices';
import { createTrip, addQuestion, updateRequestStatus, requestsForTrip } from '../lib/trips';
import { representativeFor } from '../lib/congress/legislators';
import { seedDomain, searchSchools, resolveSchoolDistrict } from '../lib/schools';
import { addDays, toIsoDate } from '../lib/dates';

// ---------------------------------------------------------------------------
// Venues — researched public information, no partnerships
// ---------------------------------------------------------------------------

interface SeedVenue {
  name: string;
  kind: string;
  address: string;
  walkMinutes: number | null;
  maxGroup: number | null;
  pricePerStudentCents: number | null;
  takesAdvanceOrders: boolean;
  dietary: string[];
  notes: string;
  sourceUrl: string | null;
}

const VENUES: SeedVenue[] = [
  {
    name: 'Capitol Visitor Center Restaurant',
    kind: 'cafeteria',
    address: 'US Capitol Visitor Center, lower level, First St NE, Washington, DC 20515',
    walkMinutes: 0,
    maxGroup: null,
    pricePerStudentCents: null,
    takesAdvanceOrders: true,
    dietary: ['vegetarian'],
    notes:
      'Inside the building you are already visiting, which removes a screening round-trip. This is the default for most school groups. Call ahead for group seating — capacity and pricing depend on the day and are not published.',
    sourceUrl: 'https://www.visitthecapitol.gov/',
  },
  {
    name: 'Union Station food hall',
    kind: 'food_hall',
    address: '50 Massachusetts Ave NE, Washington, DC 20002',
    walkMinutes: 15,
    maxGroup: null,
    pricePerStudentCents: null,
    takesAdvanceOrders: false,
    dietary: ['vegetarian', 'vegan', 'halal', 'gluten_free'],
    notes:
      'The most reliable option for a large group, because it is many counters rather than one kitchen — students split up, pick their own price point, and reconvene. Also where you are already arriving if you came by Amtrak. Seating is first-come.',
    sourceUrl: 'https://www.unionstationdc.com/',
  },
  {
    name: 'Eastern Market',
    kind: 'food_hall',
    address: '225 7th St SE, Washington, DC 20003',
    walkMinutes: 18,
    maxGroup: null,
    pricePerStudentCents: null,
    takesAdvanceOrders: false,
    dietary: ['vegetarian'],
    notes:
      'A public market with several food vendors and outdoor space, near Eastern Market Metro. Closed Mondays. Good for a group that wants to eat outside in decent weather; poor in the rain, as most seating is uncovered.',
    sourceUrl: 'https://easternmarket-dc.org/',
  },
  {
    name: 'Bartholdi Park lawn (bring your own)',
    kind: 'outdoor',
    address: '100 Maryland Ave SW, Washington, DC 20001',
    walkMinutes: 8,
    maxGroup: null,
    pricePerStudentCents: 0,
    takesAdvanceOrders: false,
    dietary: [],
    notes:
      'Not a restaurant — an option. Packed lunches eaten outdoors, next to the US Botanic Garden. Free, needs no reservation, and solves the "no food inside and nowhere to store bags" problem if you eat before you go through screening. Weather-dependent, and there are no on-site facilities for a group.',
    sourceUrl: 'https://www.usbg.gov/bartholdi-park',
  },
  {
    name: 'Barracks Row (8th Street SE)',
    kind: 'sit_down',
    address: '8th St SE between D St and I St, Washington, DC 20003',
    walkMinutes: 22,
    maxGroup: null,
    pricePerStudentCents: null,
    takesAdvanceOrders: true,
    dietary: ['vegetarian', 'vegan', 'gluten_free'],
    notes:
      'A commercial strip with many independent restaurants, several of which take group bookings with notice. Further out than the other options, so best if your schedule has slack. You would be calling individual restaurants rather than booking a single venue.',
    sourceUrl: null,
  },
];

// ---------------------------------------------------------------------------

function seedVenues(): number {
  let count = 0;
  transaction(() => {
    for (const v of VENUES) {
      const existing = get<{ id: string }>('SELECT id FROM venues WHERE name = ?', v.name);
      if (existing) continue;
      run(
        `INSERT INTO venues (
           id, name, kind, address, walk_minutes, max_group, price_per_student_cents,
           takes_advance_orders, dietary, notes, source_url, is_partner, created_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId(),
        v.name,
        v.kind,
        v.address,
        v.walkMinutes,
        v.maxGroup,
        v.pricePerStudentCents,
        v.takesAdvanceOrders ? 1 : 0,
        JSON.stringify(v.dietary),
        v.notes,
        v.sourceUrl,
        0, // is_partner — stays 0 until a real agreement exists
        nowIso(),
      );
      count += 1;
    }
  });
  return count;
}

function createUser(email: string, name: string, role: string, schoolNcesId: string | null): string {
  const existing = get<{ id: string }>('SELECT id FROM users WHERE email = ?', email);
  if (existing) return existing.id;

  const id = newId();
  run(
    `INSERT INTO users (id, email, name, role, school_nces_id, email_verified_at, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    id,
    email,
    name,
    role,
    schoolNcesId,
    nowIso(),
    nowIso(),
  );
  return id;
}

/** Pick a real school in a given district, preferring high schools. */
async function pickSchool(state: string, district: number, nameHint: string) {
  const candidates = searchSchools(nameHint, state, 40);
  for (const school of candidates) {
    const resolved = await resolveSchoolDistrict(school);
    if (resolved && resolved.state === state && resolved.district === district) return school;
  }
  return null;
}

async function main() {
  migrate();

  console.log('Creating office records for every current member…');
  const created = ensureOfficesExist();
  console.log(`  ${created} new offices (${all('SELECT 1 FROM offices').length} total)\n`);

  console.log('Seeding lunch venues…');
  console.log(`  ${seedVenues()} venues added (0 partners, by design)\n`);

  // -------------------------------------------------------------------------
  // A real school in VA-10, resolved through the Census Geocoder.
  // -------------------------------------------------------------------------
  console.log('Finding a real school in VA-10 and resolving its district…');
  const school =
    (await pickSchool('VA', 10, 'High')) ??
    (await pickSchool('VA', 10, 'Elementary')) ??
    null;

  if (!school) {
    console.error('  Could not resolve a VA-10 school. Run `npm run data:schools` first.');
    process.exit(1);
  }
  console.log(`  ${school.name} — ${school.city}, ${school.state} → VA-10\n`);

  // A plausible district domain, seeded so the demo shows a confirmed match.
  seedDomain('lcps.org', school.nces_id, 'Seeded for the demo; confirm before relying on it.');

  // -------------------------------------------------------------------------
  // Teachers and trips
  // -------------------------------------------------------------------------
  const teacherId = createUser('demo.teacher@lcps.org', 'Dana Whitfield (demo)', 'teacher', school.nces_id);
  const teacher2Id = createUser('demo.teacher2@lcps.org', 'Marcus Reyes (demo)', 'teacher', school.nces_id);

  const today = toIsoDate(new Date());

  console.log('Creating demo trips…');

  // Trip 1 — 34 people. Over the 15-guest staff-led cap. This is the case the
  // whole product exists for.
  const bigTrip = createTrip({
    teacherId,
    schoolNcesId: school.nces_id,
    title: '8th Grade Civics — Capitol Trip',
    preferredDate: addDays(today, 104),
    alternateDates: [addDays(today, 111), addDays(today, 118)],
    students: 28,
    teachers: 2,
    chaperones: 4,
    gradeBand: 'middle',
    arrivalMethod: 'charter_bus',
    accessibilityNeeds: ['wheelchair'],
    wantsTour: true,
    wantsMeeting: true,
    districtState: 'VA',
    districtNumber: 10,
  });
  console.log(`  "${bigTrip.title}" — 34 guests, join code ${bigTrip.join_code}`);

  // Trip 2 — 14 people. Fits a staff-led tour, for contrast.
  const smallTrip = createTrip({
    teacherId: teacher2Id,
    schoolNcesId: school.nces_id,
    title: 'AP Government Seminar — Capitol Visit',
    preferredDate: addDays(today, 61),
    alternateDates: [addDays(today, 68)],
    students: 11,
    teachers: 1,
    chaperones: 2,
    gradeBand: 'high',
    arrivalMethod: 'amtrak',
    accessibilityNeeds: [],
    wantsTour: true,
    wantsMeeting: false,
    districtState: 'VA',
    districtNumber: 10,
  });
  console.log(`  "${smallTrip.title}" — 14 guests, join code ${smallTrip.join_code}\n`);

  // -------------------------------------------------------------------------
  // A claimed congressional office, so the queue has something in it
  // -------------------------------------------------------------------------
  const rep = representativeFor('VA', 10);
  if (rep) {
    const office = officeByBioguide(rep.bioguideId);
    if (office) {
      console.log(`Claiming the office of ${rep.name} for the demo…`);
      const staffId = createUser('demo.staffer@mail.house.gov', 'Alex Chen (demo staffer)', 'staff', null);
      requestOfficeClaim(office.id, staffId, 'Scheduler');
      approveOfficeClaim(office.id, staffId);

      // Push the small trip's office request into the queue so the demo opens
      // on a queue with work in it rather than an empty state.
      for (const request of requestsForTrip(smallTrip.id)) {
        if (request.destination_type === 'house_office_tour') {
          updateRequestStatus({
            requestId: request.id,
            to: 'sent',
            actorType: 'teacher',
            actorName: 'Marcus Reyes (demo)',
            sendMode: 'in_app',
            note: 'Submitted through CapitolPass to a claimed office.',
          });
        }
      }
      console.log(`  Claimed by demo.staffer@mail.house.gov, one request in the queue\n`);
    }
  }

  // -------------------------------------------------------------------------
  // Student questions, for the moderation view
  // -------------------------------------------------------------------------
  console.log('Adding student questions…');
  const questions: Array<[string, string]> = [
    ['Priya', 'What is a bill you voted on recently that you found difficult to decide?'],
    ['Jordan', 'How much of your week is actually spent voting versus doing other things?'],
    ['Sam', 'What do you do when most of your district disagrees with you on something?'],
    ['Alex', 'How do you decide which committees to try to join?'],
    ['Riley', 'What is something about Congress that surprised you when you started?'],
  ];
  for (const [name, body] of questions) addQuestion(bigTrip.id, name, body);
  console.log(`  ${questions.length} questions on "${bigTrip.title}"\n`);

  console.log('─'.repeat(64));
  console.log('Demo accounts (sign in at /signin — the link prints to this console):');
  console.log('  Teacher (large group) : demo.teacher@lcps.org');
  console.log('  Teacher (small group) : demo.teacher2@lcps.org');
  console.log('  Congressional staff   : demo.staffer@mail.house.gov');
  console.log(`  Student join codes    : ${bigTrip.join_code}, ${smallTrip.join_code}`);
  console.log('─'.repeat(64));
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
