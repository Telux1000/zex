import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/activity';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { INSIGHT_THRESHOLDS } from '@/lib/insights/constants';
import { notifyBusinessEvent } from '@/services/notifications';

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) {
    return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', user.id)
    .single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('business_id', businessId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const businessId = body.business_id as string | undefined;
    const description = body.description != null ? String(body.description).trim() : '';
    const category = body.category != null ? String(body.category).trim() || 'General' : 'General';
    const amount = Number(body.amount);
    const expenseDate =
      body.expense_date != null && String(body.expense_date).trim() !== ''
        ? String(body.expense_date).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const attachmentUrl =
      body.attachment_url != null && String(body.attachment_url).trim() !== ''
        ? String(body.attachment_url).trim()
        : null;
    const attachmentName =
      body.attachment_name != null && String(body.attachment_name).trim() !== ''
        ? String(body.attachment_name).trim()
        : null;
    const attachmentType =
      body.attachment_type != null && String(body.attachment_type).trim() !== ''
        ? String(body.attachment_type).trim()
        : null;
    const attachmentSize =
      body.attachment_size != null && Number.isFinite(Number(body.attachment_size))
        ? Number(body.attachment_size)
        : null;
    const notes =
      body.notes != null && String(body.notes).trim() !== '' ? String(body.notes).trim() : null;

    if (!businessId) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('id, currency')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single();
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    const cur = (biz as { currency?: string }).currency ?? 'USD';

    const { data: row, error } = await supabase
      .from('expenses')
      .insert({
        business_id: businessId,
        expense_date: expenseDate,
        description,
        category,
        amount,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_type: attachmentType,
        attachment_size: attachmentSize,
        notes,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const hi = amount >= INSIGHT_THRESHOLDS.highExpenseActivityAmount;
    await createActivity(supabase, {
      business_id: businessId,
      eventType: hi ? 'high_expense_created' : 'expense_created',
      title: hi ? 'High expense recorded' : 'Expense recorded',
      description: `${formatCurrencyAmount(amount, cur)} — ${description} (${category})`,
      entityType: 'expense',
      entityId: (row as { id: string }).id,
      severity: hi ? 'warning' : 'info',
      amount,
      currencyCode: cur,
      metadata: { category },
    });

    if (hi) {
      await notifyBusinessEvent(supabase, {
        businessId,
        eventType: 'high_expense_created',
        title: 'High expense recorded',
        message: `${formatCurrencyAmount(amount, cur)} recorded in ${category}.`,
        entityType: 'expense',
        entityId: (row as { id: string }).id,
        severity: 'warning',
        actionLabel: 'Review expenses',
        actionTarget: '/dashboard/expenses',
        groupKey: `high_expense_created:${category}:${new Date().toISOString().slice(0, 10)}`,
        internalEmail: {
          subject: 'High expense alert',
          textBody: `A high expense was recorded: ${formatCurrencyAmount(amount, cur)} (${category}).`,
          templateEnvKey: 'POSTMARK_TEMPLATE_HIGH_EXPENSE_INTERNAL',
          templateModel: {
            amount,
            currency: cur,
            category,
            description,
          },
          tag: 'high_expense_created',
        },
      });
    }
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
