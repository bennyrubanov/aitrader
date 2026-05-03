---
name: Custom signup confirmation email
overview: Route signup confirmation through a server API route that generates the confirmation link via Supabase admin and sends it through the existing Gmail infrastructure, matching the password-reset pattern. Also add localhost to Supabase's redirect allowlist so confirmation links work locally.
todos:
  - id: signup-route
    content: Create /api/auth/signup server route using admin.generateLink + sendEmailByGmail
    status: completed
  - id: signup-page
    content: Update sign-up page to call the new API route instead of supabase.auth.signUp()
    status: completed
  - id: dashboard-note
    content: Remind user to add localhost:3000 to Supabase Dashboard redirect allowlist
    status: completed
isProject: false
---

# Custom Signup Confirmation Email

## Context

The sign-up page currently calls `supabase.auth.signUp()` from the browser ([src/app/sign-up/page.tsx](src/app/sign-up/page.tsx) line 146), which triggers Supabase's built-in confirmation email from `noreply@mail.app.supabase.io`. The link in that email redirects to `tryaitrader.com` even in local dev because `localhost:3000` isn't in the Supabase project's redirect allowlist.

The password-reset flow already solves both problems using `admin.generateLink()` + `sendEmailByGmail` ([src/app/api/auth/password-reset/route.ts](src/app/api/auth/password-reset/route.ts)). We replicate that pattern for signup.

## Part 1: Server-side signup API route

Create **`src/app/api/auth/signup/route.ts`** that:

1. Accepts `{ email, password, nextPath }` via POST
2. Validates email format and password strength (same rules as client-side: uppercase, lowercase, number, special char, 8+ chars)
3. Calls `supabase.auth.admin.generateLink({ type: "signup", email, password, options: { redirectTo: origin + "/auth/callback?next=..." } })` -- this creates the user AND returns an `action_link` without sending Supabase's default email
4. Sends a branded HTML confirmation email via `sendEmailByGmail` (reuse [src/lib/sendEmailByGmail.ts](src/lib/sendEmailByGmail.ts))
5. Returns `{ ok: true }` on success; handles duplicate users gracefully (return generic success to avoid enumeration, matching the password-reset pattern)

Key reference -- the password-reset route does exactly this pattern:

```32:43:src/app/api/auth/password-reset/route.ts
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
```

For signup, we change `type: "recovery"` to `type: "signup"` and include `password` in the call.

## Part 2: Update the sign-up page

Modify [src/app/sign-up/page.tsx](src/app/sign-up/page.tsx) `handleSubmit`:

- Replace the direct `supabase.auth.signUp()` call (lines 146-152) with a `fetch("/api/auth/signup", ...)` call to the new server route
- Keep the existing client-side password validation, error handling, and "account already exists" detection
- The "account already exists" check changes slightly: `admin.generateLink` for an existing confirmed user returns an error; the API route can return a distinct status (e.g. `{ exists: true }`) so the client can show the existing toast

## Part 3: Supabase Dashboard -- add localhost to redirect allowlist

This is a manual step (not code):

- Go to **Supabase Dashboard -> Authentication -> URL Configuration**
- Add `http://localhost:3000/**` to the **Redirect URLs** list
- This ensures the `redirect_to` parameter in confirmation links is honored when it points to localhost

This is needed regardless of the custom email approach, because the confirmation `action_link` from `generateLink` routes through Supabase's auth server (`https://your-project.supabase.co/auth/v1/verify?...&redirect_to=http://localhost:3000/auth/callback`) and Supabase validates the redirect target against the allowlist.

## Files changed

- **New**: `src/app/api/auth/signup/route.ts` (server route, ~70 lines, modeled on `password-reset/route.ts`)
- **Edit**: `src/app/sign-up/page.tsx` (replace `signUp()` with `fetch` to new route, ~15 lines changed)
