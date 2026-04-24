import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { verifyUnsubscribePayload } from '@/lib/notifications/unsubscribe-token';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const payload = verifyUnsubscribePayload(token);
  if (!payload) {
    return new NextResponse(
      `<!DOCTYPE html><html><body><p>Invalid or expired link.</p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const admin = createAdminClient();

  if (payload.scope === 'onboarding') {
    const { error } = await admin
      .from('user_welcome_email_progress')
      .update({
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', payload.userId);

    if (error) {
      return new NextResponse(
        `<!DOCTYPE html><html><body><p>Something went wrong. Please update preferences in Settings.</p></body></html>`,
        { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px">
      <p>You are unsubscribed from the onboarding email series.</p>
      <p><a href="/platform/settings/notifications">Open notification settings</a></p>
    </body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const { error } = await admin
    .from('user_notification_preferences')
    .upsert(
      {
        user_id: payload.userId,
        email_enabled: false,
        weekly_digest_email: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    return new NextResponse(
      `<!DOCTYPE html><html><body><p>Something went wrong. Please update preferences in Settings.</p></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:system-ui;padding:24px">
      <p>You are unsubscribed from AITrader notification emails.</p>
      <p><a href="/platform/settings/notifications">Open notification settings</a></p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
