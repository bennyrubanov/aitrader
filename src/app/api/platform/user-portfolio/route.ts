import { NextResponse } from 'next/server';
import { canQueryStockCurrentRecommendation, getAppAccessState } from '@/lib/app-access';
import { buildAuthStateFromUserAndProfile } from '@/lib/build-auth-state';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const unauthorizedResponse = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

type PortfolioDbRow = {
  id: string;
  stock_id: string;
  symbol: string;
  notify_on_change: boolean;
  notify_rating_inapp: boolean;
  notify_rating_email: boolean;
  added_at: string;
};

type RecommendationRow = {
  stock_id: string;
  score: number | null;
  bucket: string | null;
  latent_rank?: number | null;
};

type PriceRow = {
  symbol: string;
  last_sale_price: string | null;
  run_date: string | null;
};

async function loadStockMetaByStockIds(
  admin: ReturnType<typeof createAdminClient>,
  stockIds: string[]
): Promise<{
  premium: Map<string, boolean>;
  companyName: Map<string, string | null>;
}> {
  const premium = new Map<string, boolean>();
  const companyName = new Map<string, string | null>();
  if (!stockIds.length) return { premium, companyName };
  const { data, error } = await admin
    .from('stocks')
    .select('id, is_premium_stock, company_name')
    .in('id', stockIds);
  if (error) {
    console.error('[user-portfolio] loadStockMetaByStockIds', error.message);
    return { premium, companyName };
  }
  for (const row of (data ?? []) as {
    id: string;
    is_premium_stock: boolean | null;
    company_name: string | null;
  }[]) {
    premium.set(row.id, Boolean(row.is_premium_stock));
    companyName.set(row.id, row.company_name ?? null);
  }
  return { premium, companyName };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const { data, error } = await supabase
    .from('user_portfolio_stocks')
    .select(
      'id, stock_id, symbol, notify_on_change, notify_rating_inapp, notify_rating_email, added_at'
    )
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Unable to load portfolio.' }, { status: 500 });
  }

  const items = (data ?? []) as PortfolioDbRow[];
  if (!items.length) {
    return NextResponse.json({ items: [] });
  }

  const stockIds = items.map((i) => i.stock_id);
  const symbols = items.map((i) => i.symbol.toUpperCase());

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('subscription_tier, full_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const access = getAppAccessState(
    buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError))
  );
  const showLatentRank = access === 'supporter' || access === 'outperformer';

  const admin = createAdminClient();
  const { premium: premiumMap, companyName: companyNameMap } = await loadStockMetaByStockIds(
    admin,
    stockIds
  );

  const [recResult, priceResult] = await Promise.all([
    showLatentRank
      ? admin
          .from('nasdaq100_recommendations_current')
          .select('stock_id, score, bucket, latent_rank')
          .in('stock_id', stockIds)
      : admin
          .from('nasdaq100_recommendations_current_public')
          .select('stock_id, score, bucket')
          .in('stock_id', stockIds),
    admin
      .from('nasdaq_100_daily_raw')
      .select('symbol, last_sale_price, run_date')
      .in('symbol', symbols)
      .order('run_date', { ascending: false })
      .limit(Math.max(symbols.length, 1) * 4),
  ]);

  const recMap = new Map(
    ((recResult.data ?? []) as RecommendationRow[]).map((r) => [r.stock_id, r])
  );

  const priceMap = new Map<string, PriceRow>();
  for (const row of (priceResult.data ?? []) as PriceRow[]) {
    const sym = row.symbol.toUpperCase();
    if (!priceMap.has(sym)) priceMap.set(sym, row);
  }

  const enriched = items.map((item) => {
    const rec = recMap.get(item.stock_id);
    const price = priceMap.get(item.symbol.toUpperCase());
    const isPremiumStock = premiumMap.get(item.stock_id) ?? false;
    const base = {
      ...item,
      is_premium_stock: isPremiumStock,
      company_name: companyNameMap.get(item.stock_id) ?? null,
      notify_on_change: item.notify_rating_inapp || item.notify_rating_email,
      score: rec?.score ?? null,
      bucket: rec?.bucket ?? null,
      lastPrice: price?.last_sale_price ?? null,
      priceDate: price?.run_date ?? null,
    };
    if (!showLatentRank) {
      return base;
    }
    return {
      ...base,
      latentRank: rec?.latent_rank ?? null,
    };
  });

  return NextResponse.json({ items: enriched });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const stockId = typeof body?.stockId === 'string' ? body.stockId.trim() : '';
  const symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  const notifyRatingInapp =
    typeof body?.notifyRatingInapp === 'boolean' ? body.notifyRatingInapp : true;
  const notifyRatingEmail =
    typeof body?.notifyRatingEmail === 'boolean' ? body.notifyRatingEmail : true;

  if (!stockId || !symbol) {
    return NextResponse.json({ error: 'stockId and symbol are required.' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();
  const access = getAppAccessState(
    buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError))
  );

  const admin = createAdminClient();
  const { data: stockRow, error: stockErr } = await admin
    .from('stocks')
    .select('id, symbol, is_premium_stock')
    .eq('id', stockId)
    .maybeSingle();

  if (stockErr || !stockRow) {
    return NextResponse.json({ error: 'Stock not found.' }, { status: 404 });
  }

  const isPremium = Boolean((stockRow as { is_premium_stock?: boolean }).is_premium_stock);
  if (!canQueryStockCurrentRecommendation(access, isPremium)) {
    return NextResponse.json(
      { error: 'Premium stock tracking requires a Supporter or Outperformer plan.' },
      { status: 403 }
    );
  }

  const notifyOn = notifyRatingInapp || notifyRatingEmail;

  const { data, error } = await supabase
    .from('user_portfolio_stocks')
    .insert({
      user_id: user.id,
      stock_id: stockId,
      symbol,
      notify_rating_inapp: notifyRatingInapp,
      notify_rating_email: notifyRatingEmail,
      notify_on_change: notifyOn,
    })
    .select(
      'id, stock_id, symbol, notify_on_change, notify_rating_inapp, notify_rating_email, added_at'
    )
    .maybeSingle();

  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('user_portfolio_stocks')
      .select(
        'id, stock_id, symbol, notify_on_change, notify_rating_inapp, notify_rating_email, added_at'
      )
      .eq('user_id', user.id)
      .eq('stock_id', stockId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: 'Unable to load portfolio item.' }, { status: 500 });
    }

    return NextResponse.json({ item: existing, alreadyAdded: true });
  }

  if (error) {
    return NextResponse.json({ error: 'Unable to add stock to portfolio.' }, { status: 500 });
  }

  return NextResponse.json({ item: data, alreadyAdded: false }, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const stockId = typeof body?.stockId === 'string' ? body.stockId.trim() : '';
  const notifyOnChange = typeof body?.notifyOnChange === 'boolean' ? body.notifyOnChange : null;
  const notifyRatingInapp = typeof body?.notifyRatingInapp === 'boolean' ? body.notifyRatingInapp : null;
  const notifyRatingEmail = typeof body?.notifyRatingEmail === 'boolean' ? body.notifyRatingEmail : null;

  if (!stockId) {
    return NextResponse.json({ error: 'stockId is required.' }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await supabase
    .from('user_portfolio_stocks')
    .select('notify_rating_inapp, notify_rating_email')
    .eq('user_id', user.id)
    .eq('stock_id', stockId)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: 'Unable to load stock row.' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Stock row not found.' }, { status: 404 });
  }

  const cur = existing as { notify_rating_inapp: boolean; notify_rating_email: boolean };
  let nextInapp = cur.notify_rating_inapp;
  let nextEmail = cur.notify_rating_email;
  if (notifyRatingInapp !== null) nextInapp = notifyRatingInapp;
  if (notifyRatingEmail !== null) nextEmail = notifyRatingEmail;
  if (notifyOnChange !== null && notifyRatingInapp === null && notifyRatingEmail === null) {
    nextInapp = notifyOnChange;
    nextEmail = notifyOnChange;
  }

  if (
    notifyRatingInapp === null &&
    notifyRatingEmail === null &&
    notifyOnChange === null
  ) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle();
  const access = getAppAccessState(
    buildAuthStateFromUserAndProfile(user, profile, Boolean(profileError))
  );

  const admin = createAdminClient();
  const { data: stockRow } = await admin
    .from('stocks')
    .select('is_premium_stock')
    .eq('id', stockId)
    .maybeSingle();
  const isPremium = Boolean((stockRow as { is_premium_stock?: boolean } | null)?.is_premium_stock);

  if ((nextInapp || nextEmail) && !canQueryStockCurrentRecommendation(access, isPremium)) {
    return NextResponse.json(
      { error: 'Premium stock tracking requires a Supporter or Outperformer plan.' },
      { status: 403 }
    );
  }

  const notifyOn = nextInapp || nextEmail;
  const { data, error } = await supabase
    .from('user_portfolio_stocks')
    .update({
      notify_rating_inapp: nextInapp,
      notify_rating_email: nextEmail,
      notify_on_change: notifyOn,
    })
    .eq('user_id', user.id)
    .eq('stock_id', stockId)
    .select(
      'id, stock_id, symbol, notify_on_change, notify_rating_inapp, notify_rating_email, added_at'
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Unable to update stock.' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  const stockId = typeof body?.stockId === 'string' ? body.stockId.trim() : '';

  if (!stockId) {
    return NextResponse.json({ error: 'stockId is required.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_portfolio_stocks')
    .delete()
    .eq('user_id', user.id)
    .eq('stock_id', stockId);

  if (error) {
    return NextResponse.json({ error: 'Unable to remove stock from portfolio.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
