import { NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/ai/openai-server';
import { parseInvoiceFromText } from '@/lib/ai/invoice-parser';
import { createClient } from '@/lib/supabase/server';
import { getPrimaryBusinessForUser } from '@/lib/supabase/server-auth';
import {
  assertWorkspaceCoreWriteAccess,
  getOwnerBillingPlanAfterReconcile,
} from '@/lib/billing/subscription-access';
import { featureUpgradeMessage, hasPlanFeature } from '@/lib/billing/plans';

function inferTaxPercentFromText(text: string): number {
  const lower = text.toLowerCase();

  // Match patterns like "10% tax" or "10 % vat"
  const percentWithSymbol = Array.from(
    lower.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(tax|vat)?/g)
  );
  if (percentWithSymbol.length > 0) {
    const value = parseFloat(percentWithSymbol[percentWithSymbol.length - 1][1]);
    if (!Number.isNaN(value)) return value;
  }

  // Match patterns like "10 percent tax"
  const percentWord = Array.from(
    lower.matchAll(/(\d+(?:\.\d+)?)\s*(percent|per cent)\s*(tax|vat)?/g)
  );
  if (percentWord.length > 0) {
    const value = parseFloat(percentWord[percentWord.length - 1][1]);
    if (!Number.isNaN(value)) return value;
  }

  return 0;
}

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const primary = await getPrimaryBusinessForUser(user.id);
    if (!primary?.ownerId) {
      return NextResponse.json({ error: 'No workspace found.' }, { status: 400 });
    }
    const subGate = await assertWorkspaceCoreWriteAccess(supabase, primary.ownerId);
    if (!subGate.ok) return subGate.response;

    const billingPlan = await getOwnerBillingPlanAfterReconcile(supabase, primary.ownerId);
    if (!hasPlanFeature(billingPlan, 'voice_screenshot_invoice')) {
      return NextResponse.json(
        {
          error: featureUpgradeMessage('voice_screenshot_invoice'),
          code: 'plan_feature_voice_screenshot',
          current_plan: billingPlan,
          cta: 'Upgrade',
        },
        { status: 403 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type, expected multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 500 });
    }

    const transcription = await getOpenAI().audio.transcriptions.create({
      model: 'whisper-1',
      file: file as any,
      response_format: 'text',
      temperature: 0.1,
    });

    const transcript = typeof transcription === 'string'
      ? transcription
      : (transcription as any).text ?? '';

    if (!transcript) {
      return NextResponse.json({ error: 'Empty transcription from OpenAI' }, { status: 500 });
    }

    const parsed = await parseInvoiceFromText(transcript);

    const items = parsed.items.map((item) => ({
      description: item.name,
      quantity: item.quantity,
      unitLabel: item.unit_label ?? 'item',
      unitPrice: item.unit_price,
      lineTotal: item.amount,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const taxPercent = inferTaxPercentFromText(transcript);
    const taxAmount = subtotal * (taxPercent / 100);
    const total = subtotal + taxAmount;

    const invoice = {
      clientName: parsed.customer_name,
      invoiceNumber: '',
      dueDate: parsed.due_date ?? '',
      taxPercent,
      notes: parsed.notes ?? '',
      items,
    };

    return NextResponse.json({
      transcript,
      invoice,
      subtotal,
      taxAmount,
      total,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown server error';
    console.error('Voice invoice error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

