/**
 * The one-page chaperone briefing.
 *
 * Designed to be printed and carried. A chaperone is a parent who volunteered
 * three weeks ago and has not read anything since — so this is one page, in
 * large type, with the things that actually go wrong at the top and the phone
 * numbers at the bottom where they can be found in a hurry.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { RULES } from '../feasibility/rules.config';
import { formatLong } from '../dates';

export interface BriefingInput {
  tripTitle: string;
  schoolName: string;
  date: string;
  students: number;
  teachers: number;
  chaperones: number;
  /** The engine's grade band key, used to look up the ratio. */
  gradeBand: keyof typeof RULES.chaperoneRatios.value;
  /** How to write that band for a human. */
  gradeBandLabel: string;
  leadTeacherName: string;
  leadTeacherEmail: string;
  stationName: string;
  walkMinutes: number;
  arrivalMethod: string;
  memberName: string | null;
  memberPhone: string | null;
  joinCode: string;
}

const INK = rgb(0.04, 0.08, 0.14);
const MUTED = rgb(0.35, 0.34, 0.31);
const RULE = rgb(0.78, 0.77, 0.74);
const ALERT = rgb(0.55, 0.11, 0.11);

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Greedy wrap to a pixel width. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildBriefingPdf(input: BriefingInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Chaperone briefing — ${input.tripTitle}`);
  doc.setCreator('CapitolPass');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const text = (
    value: string,
    opts: { font?: PDFFont; size?: number; color?: typeof INK; indent?: number } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    const indent = opts.indent ?? 0;
    for (const line of wrap(value, font, size, CONTENT_WIDTH - indent)) {
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        size,
        font,
        color: opts.color ?? INK,
      });
      y -= size * 1.35;
    }
  };

  const gap = (amount = 8) => {
    y -= amount;
  };

  const divider = () => {
    gap(6);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: RULE,
    });
    gap(12);
  };

  const heading = (value: string) => {
    gap(4);
    text(value, { font: bold, size: 12.5 });
    gap(3);
  };

  const bullet = (value: string, color = INK) => {
    page.drawText('•', { x: MARGIN, y, size: 10.5, font: bold, color });
    for (const [i, line] of wrap(value, regular, 10.5, CONTENT_WIDTH - 14).entries()) {
      page.drawText(line, { x: MARGIN + 14, y, size: 10.5, font: regular, color });
      y -= 10.5 * 1.35;
      if (i === 0) continue;
    }
    y -= 2;
  };

  // ---- Header -------------------------------------------------------------
  text('CHAPERONE BRIEFING', { font: bold, size: 9, color: MUTED });
  gap(2);
  text(input.tripTitle, { font: bold, size: 20 });
  gap(2);
  text(`${input.schoolName} · ${formatLong(input.date)}`, { size: 11, color: MUTED });
  gap(4);
  text(
    `${input.students + input.teachers + input.chaperones} people: ${input.students} students, ${input.teachers} teachers, ${input.chaperones} chaperones · ${input.gradeBandLabel}`,
    { size: 10, color: MUTED },
  );

  divider();

  // ---- The four things that actually go wrong -----------------------------
  heading('Four things that go wrong. Please read these.');

  bullet(
    `NO FOOD OR DRINK inside the Capitol — water bottles included. Everything gets eaten or binned before we go through security.`,
    ALERT,
  );
  bullet(
    `NO BAG STORAGE. There are no lockers and no cloakroom. Anything a student brings, they carry all day. Backpacks should stay ${input.arrivalMethod === 'charter_bus' ? 'on the bus' : 'at the hotel'}.`,
    ALERT,
  );
  bullet(
    `WE ARRIVE ${RULES.securityScreeningBufferMinutes.value} MINUTES EARLY. Every visitor is screened like an airport. A group our size is slow through it, and a late group loses its slot entirely.`,
    ALERT,
  );
  bullet(
    'NO PARKING AT THE CAPITOL. Street parking nearby is extremely limited and there is no visitor lot. We are on foot and on Metro once we arrive.',
    ALERT,
  );

  divider();

  // ---- Getting there ------------------------------------------------------
  heading('Getting there');
  bullet(
    `Metro to ${input.stationName}, then about ${input.walkMinutes} minutes on foot to the Visitor Center entrance.`,
  );
  bullet(
    'Agree a meeting point above ground before going underground, in case the group is split across two trains.',
  );
  bullet('Fare cards are loaded before the day. Do not queue at the machines with students.');

  divider();

  // ---- Supervision --------------------------------------------------------
  heading('Supervision');
  const ratio = RULES.chaperoneRatios.value[input.gradeBand] ?? RULES.chaperoneRatios.value.mixed;
  bullet(
    `Suggested ratio for this group is about one adult per ${ratio} students. Your school district's own policy takes precedence over this suggestion.`,
  );
  bullet('Count your group at every transition: off the bus, before screening, after screening, before leaving.');
  bullet(
    'Phones stay on and audible. If a student is separated, they should stay where they are and call, not go looking.',
  );

  divider();

  // ---- Contacts -----------------------------------------------------------
  heading('If something goes wrong');
  text(`Trip lead: ${input.leadTeacherName}`, { font: bold, size: 11 });
  text(input.leadTeacherEmail, { size: 10.5, color: MUTED });
  gap(4);

  if (input.memberName) {
    text(`Congressional office: ${input.memberName}`, { size: 10.5 });
    if (input.memberPhone) text(input.memberPhone, { size: 10.5, color: MUTED });
    gap(4);
  }

  text('Capitol Visitor Center: 202-226-8000', { size: 10.5 });
  text('Emergency: 911', { size: 10.5 });

  // ---- Footer -------------------------------------------------------------
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 22 },
    end: { x: PAGE_WIDTH - MARGIN, y: MARGIN + 22 },
    thickness: 0.75,
    color: RULE,
  });

  page.drawText(
    `Generated by CapitolPass · trip code ${input.joinCode} · ruleset ${RULES.staffLedMaxGuests.source.lastVerified}`,
    { x: MARGIN, y: MARGIN + 8, size: 8, font: regular, color: MUTED },
  );

  return doc.save();
}

/** Type helper for the PDF page, kept so the drawing helpers stay readable. */
export type { PDFPage };
