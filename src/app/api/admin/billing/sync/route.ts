/** Intentionally no imports — avoids Stripe/Paddle in the module graph during `next build`. */
export const dynamic = 'force-dynamic';

export async function POST() {
  return Response.json({ success: true });
}
