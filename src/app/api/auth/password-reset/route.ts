import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendTransactionalEmail } from "@/lib/mailer";
import {
  DEFAULT_POST_AUTH_PATH,
  sanitizeAuthRedirectPath,
} from "@/lib/auth-redirect";

export const runtime = "nodejs";

type PasswordResetRequest = {
  email?: string;
  nextPath?: string;
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PasswordResetRequest;
    const email = body.email?.trim().toLowerCase() ?? "";
    const nextPath = sanitizeAuthRedirectPath(body.nextPath, DEFAULT_POST_AUTH_PATH);

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/update-password?next=${encodeURIComponent(nextPath)}`;
    const supabase = createAdminClient();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    // Return generic success to avoid email-enumeration behavior.
    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ ok: true });
    }

    const actionLink = data.properties.action_link;
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">Reset your AITrader password</h2>
        <p style="margin: 0 0 16px;">
          Click the button below to set or update your password.
        </p>
        <p style="margin: 0 0 20px;">
          <a
            href="${actionLink}"
            style="display: inline-block; background: #0A84FF; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;"
          >
            Reset password
          </a>
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `;

    const sent = await sendTransactionalEmail({
      to: email,
      html: htmlBody,
      subject: "Reset your AITrader password",
    });
    if (!sent.ok) {
      return NextResponse.json({ error: "Failed to send reset email." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
