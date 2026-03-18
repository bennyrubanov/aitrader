import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

type PasswordLoginHintRequest = {
  email?: string;
};

const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PasswordLoginHintRequest;
    const email = body.email?.trim().toLowerCase() ?? "";

    if (!isValidEmail(email)) {
      return NextResponse.json({ requiresPasswordSetup: false });
    }

    const supabase = createAdminClient();
    let page = 1;
    const perPage = 200;
    const maxPages = 10;

    while (page <= maxPages) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error || !data?.users?.length) {
        return NextResponse.json({ requiresPasswordSetup: false });
      }

      const matchedUser = data.users.find(
        (user) => (user.email ?? "").trim().toLowerCase() === email,
      );

      if (matchedUser) {
        const providers = (matchedUser.app_metadata?.providers ?? []) as string[];
        const hasGoogle = providers.includes("google");
        const hasEmailProvider = providers.includes("email");

        return NextResponse.json({
          requiresPasswordSetup: hasGoogle && !hasEmailProvider,
        });
      }

      if (data.users.length < perPage) {
        break;
      }
      page += 1;
    }

    return NextResponse.json({ requiresPasswordSetup: false });
  } catch {
    return NextResponse.json({ requiresPasswordSetup: false });
  }
}
