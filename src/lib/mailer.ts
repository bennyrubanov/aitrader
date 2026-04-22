import { Resend } from 'resend';
import { sendEmailByGmail } from '@/lib/sendEmailByGmail';

export type SendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

/**
 * User-facing transactional email (auth, notifications, digests).
 * Uses Resend when configured; falls back to Gmail SMTP for local dev without Resend.
 */
export async function sendTransactionalEmail(
  input: SendMailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (apiKey && from) {
    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from,
        replyTo: process.env.RESEND_REPLY_TO || undefined,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: input.headers,
      });
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const to = Array.isArray(input.to) ? input.to[0] : input.to;
  const ok = await sendEmailByGmail(to, input.html, input.subject, {
    text: input.text,
    headers: input.headers,
  });
  return ok ? { ok: true } : { ok: false, error: 'Gmail SMTP send failed' };
}
