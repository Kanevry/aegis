import { NextRequest, NextResponse } from 'next/server';

// Stub webhook receiver for Sentry webhooks
// Phase 2: Will integrate with Seer-loop for auto-issue creation

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log webhook for debugging (in production, process and create GitLab issues)
    console.error('[SENTRY WEBHOOK]', {
      timestamp: new Date().toISOString(),
      headers: Object.fromEntries(request.headers.entries()),
      body,
    });

    // Stub: Always return success
    // Future: Validate signature, process issue data, create GitLab MR

    return NextResponse.json({ status: 'received' }, { status: 200 });
  } catch (error) {
    console.error('[SENTRY WEBHOOK ERROR]', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}