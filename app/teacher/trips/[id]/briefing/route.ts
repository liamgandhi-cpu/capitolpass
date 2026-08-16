import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { getTrip } from '@/lib/trips';
import { getSchool } from '@/lib/schools';
import { delegationFor } from '@/lib/congress/legislators';
import { recommendedStation } from '@/lib/transit/wmata';
import { buildBriefingPdf } from '@/lib/pdf/briefing';

const GRADE_LABELS: Record<string, string> = {
  elementary: 'Elementary',
  middle: 'Middle school',
  high: 'High school',
  mixed: 'Mixed grades',
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse('Sign in to download the briefing.', { status: 401 });

  const { id } = await context.params;
  const trip = getTrip(id);
  if (!trip) return new NextResponse('Trip not found.', { status: 404 });
  if (trip.teacher_id !== user.id && user.role !== 'admin') {
    return new NextResponse('Not your trip.', { status: 403 });
  }

  const school = trip.school_nces_id ? getSchool(trip.school_nces_id) : null;
  const delegation =
    trip.district_state && trip.district_number !== null
      ? delegationFor(trip.district_state, trip.district_number)
      : null;
  const station = recommendedStation(trip.arrival_method);

  const pdf = await buildBriefingPdf({
    tripTitle: trip.title,
    schoolName: school?.name ?? user.school_freeform ?? 'Our school',
    date: trip.preferred_date,
    students: trip.students,
    teachers: trip.teachers,
    chaperones: trip.chaperones,
    gradeBand: trip.grade_band,
    gradeBandLabel: GRADE_LABELS[trip.grade_band] ?? trip.grade_band,
    leadTeacherName: user.name ?? user.email,
    leadTeacherEmail: user.email,
    stationName: station.name,
    walkMinutes: station.walkMinutesToCvc,
    arrivalMethod: trip.arrival_method,
    memberName: delegation?.representative?.name ?? null,
    memberPhone: delegation?.representative?.phone ?? null,
    joinCode: trip.join_code,
  });

  const filename = `chaperone-briefing-${trip.join_code}.pdf`;

  return new NextResponse(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
