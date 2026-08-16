import { NextResponse } from 'next/server';
import { endSession } from '@/lib/auth';
import { absoluteUrl } from '@/lib/site-url';

export async function POST(request: Request) {
  await endSession();
  return NextResponse.redirect(absoluteUrl('/', request), { status: 303 });
}
