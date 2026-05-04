# Directive plan: load Inter as the app font (Next.js 15)

**Goal:** Use the **Inter** typeface site-wide via `next/font/google`. **Do not** add the `geist` package. **Do not** change unrelated files.

**Prerequisites:** Repo path `aitrader`, Next.js 15+, file [src/app/layout.tsx](src/app/layout.tsx) exists, [tailwind.config.ts](tailwind.config.ts) exists.

**Success criteria:**

1. `next dev` runs with no new errors.
2. In browser DevTools → Elements → computed styles on `<body>`, `font-family` lists **Inter** (or a Next-generated Inter fallback name) first.
3. No new npm dependencies (Inter comes from `next/font/google`, already part of Next).

---

## Step 1 — Edit `src/app/layout.tsx`

### 1a. Add this import at the top of the file (after existing imports, before `const siteUrl`)

Use exactly this import path (Next.js built-in):

```ts
import { Inter } from 'next/font/google';
```

### 1b. Instantiate Inter once at module scope (after the `import` block, before `const siteUrl`)

Add this constant. Keep the property names and string values exactly as written:

```ts
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
```

**Do not** add a separate `weight` array unless you see a build error asking for it; the default variable font weights are enough.

### 1c. Put the font CSS variable on `<html>` and apply Tailwind sans + antialiasing

Find the opening tag:

```tsx
<html lang="en" suppressHydrationWarning>
```

Replace it with (preserve `suppressHydrationWarning`):

```tsx
<html lang="en" suppressHydrationWarning className={`${inter.variable} font-sans antialiased`}>
```

**Rules:**

- You must use `` `${inter.variable} font-sans antialiased` `` (or equivalent concatenation). `inter.variable` is a string class name Next injects; it defines the CSS variable `--font-sans`.
- Do **not** remove `suppressHydrationWarning`.
- Do **not** wrap the root layout in a new client component (`'use client'`). This file must stay a Server Component unless it already had `'use client'` (it does not).

### 1d. Save the file

Ensure there are no duplicate `Inter` imports or duplicate `const inter` declarations.

---

## Step 2 — Edit `tailwind.config.ts`

### 2a. Locate `fontFamily` under `theme.extend`

Current block (for reference only — replace the `sans` array as in 2b):

```ts
fontFamily: {
  sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
},
```

### 2b. Replace the `sans` value with Inter first, then system fallbacks

The `sans` array **must** start with the CSS variable that matches Step 1b (`--font-sans`). Use exactly:

```ts
fontFamily: {
  sans: [
    'var(--font-sans)',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica',
    'Arial',
    'sans-serif',
  ],
},
```

**Rules:**

- The string `'var(--font-sans)'` must be the **first** entry.
- Do not rename `--font-sans` in one file without renaming it in the other.

### 2c. Save the file

---

## Step 3 — Do **not** edit these unless a build error explicitly requires it

- `package.json` — no new dependency for Inter.
- `src/app/globals.css` — body already has `font-feature-settings`; leave as-is unless you must add `font-sans` to body (Step 1c on `<html>` with `font-sans` should cascade; if computed styles show no Inter on body, add `className="font-sans antialiased"` to `<body>` as well — only if needed).
- Email templates, OG image generators, or PDF code — **out of scope** unless the user asks later.

---

## Step 4 — Verify

1. From the project root, run:

   ```bash
   npm run build
   ```

   Fix any TypeScript or ESLint errors **only** in the files you changed.

2. Run `npm run dev`, open the app, confirm Inter in computed `font-family` on a paragraph or button.

3. Optional grep: ensure no second definition of `--font-sans` conflicts in CSS.

---

## Rollback (if something breaks)

1. Remove the `Inter` import, `const inter`, and `className` from `<html>` in `layout.tsx`.
2. Restore the original single-line `sans` array in `tailwind.config.ts`.

---

## Notes for the executor (non-code)

- **License:** Inter is free for commercial use (SIL Open Font License). No payment.
- **Why `variable` + Tailwind:** Next injects optimized font files and sets `--font-sans`; Tailwind’s `font-sans` utility uses that variable so all `font-sans` classes and inherited text match.
