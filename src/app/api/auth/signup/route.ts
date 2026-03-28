import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmailByGmail } from "@/lib/sendEmailByGmail";
import {
  DEFAULT_POST_AUTH_PATH,
  sanitizeAuthRedirectPath,
} from "@/lib/auth-redirect";

export const runtime = "nodejs";

type SignupRequest = {
  email?: string;
  password?: string;
  nextPath?: string;
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

const getPasswordValidationError = (password: string): string | null => {
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[!?\-_=+<>{}@#$%^&*()[\]~`|\\/:;,.]/.test(password)) {
    return "Password must include at least one special character.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
};

const isDuplicateSignupError = (message: string, code?: string) => {
  const m = message.toLowerCase();
  if (code === "user_already_exists") return true;
  return (
    m.includes("already registered") ||
    m.includes("user already exists") ||
    m.includes("email address is already")
  );
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupRequest;
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const nextPath = sanitizeAuthRedirectPath(body.nextPath, DEFAULT_POST_AUTH_PATH);

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const supabase = createAdminClient();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo },
    });

    if (error) {
      if (isDuplicateSignupError(error.message ?? "", error.code)) {
        return NextResponse.json({ exists: true });
      }
      // Avoid leaking internal auth errors; behave like a generic success where appropriate.
      return NextResponse.json({ ok: true });
    }

    const user = data?.user;
    if (user?.email_confirmed_at) {
      // Project has email confirmations disabled — client can sign in with password.
      return NextResponse.json({ ok: true, canSignIn: true });
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      return NextResponse.json({ ok: true });
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">Confirm your AITrader account</h2>
        <p style="margin: 0 0 16px;">
          Follow the link below to confirm your email and finish signing up.
        </p>
        <p style="margin: 0 0 20px;">
          <a
            href="${actionLink}"
            style="display: inline-block; background: #0A84FF; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 8px;"
          >
            Confirm your email
          </a>
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">
          If you did not create an account, you can ignore this email.
        </p>
      </div>
    `;

    const sent = await sendEmailByGmail(
      email,
      htmlBody,
      "Confirm your AITrader account",
    );
    if (!sent) {
      return NextResponse.json(
        { error: "Failed to send confirmation email." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
