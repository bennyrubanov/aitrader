import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const MAX_USER_AGENT_LEN = 512;
const MAX_PLATFORM_LEN = 128;

type DeviceClass = "mobile" | "tablet" | "desktop" | "unknown";

function deriveDeviceClass(userAgent: string, secChUaMobile: string | null): DeviceClass {
  const mobileHint = secChUaMobile?.trim();
  if (mobileHint === "?1" || mobileHint?.toLowerCase() === "true") {
    return "mobile";
  }
  const ua = userAgent.trim();
  if (!ua) return "unknown";
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/android(?!.*mobile)/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rawUa = request.headers.get("user-agent") ?? "";
  const userAgent = rawUa.slice(0, MAX_USER_AGENT_LEN);
  const secChUaMobile = request.headers.get("sec-ch-ua-mobile");
  const rawPlatform = request.headers.get("sec-ch-ua-platform") ?? "";
  const secChUaPlatform = stripQuotes(rawPlatform).slice(0, MAX_PLATFORM_LEN);

  const deviceClass = deriveDeviceClass(userAgent, secChUaMobile);

  const last_sign_in_client: Record<string, string> = { userAgent };
  if (secChUaMobile != null && secChUaMobile !== "") {
    last_sign_in_client.secChUaMobile = secChUaMobile;
  }
  if (secChUaPlatform !== "") {
    last_sign_in_client.secChUaPlatform = secChUaPlatform;
  }

  const now = new Date().toISOString();
  const { error } = await supabase.rpc("record_user_sign_in_context", {
    p_device_class: deviceClass,
    p_client: last_sign_in_client,
    p_now: now,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
