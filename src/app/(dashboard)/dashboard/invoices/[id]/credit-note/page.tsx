import { redirect } from 'next/navigation';

/** Credit notes are not shipped yet; old links land on the invoice. */
export default function CreditNotePage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/dashboard/invoices/${params.id}`);
}
