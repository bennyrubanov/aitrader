import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ requiresPasswordSetup: false }, { status: 200 });
    }

    const admin = createAdminClient();
    const { data: adminUserData, error: adminError } = await admin.auth.admin.getUserById(user.id);
    if (adminError || !adminUserData?.user) {
      return NextResponse.json({ requiresPasswordSetup: false }, { status: 200 });
    }

    const providers = (adminUserData.user.app_metadata?.providers ?? []) as string[];
    const hasGoogle = providers.includes("google");
    const hasEmailProvider = providers.includes("email");

    return NextResponse.json({
      requiresPasswordSetup: hasGoogle && !hasEmailProvider,
    });
  } catch {
    return NextResponse.json({ requiresPasswordSetup: false }, { status: 200 });
  }
}
