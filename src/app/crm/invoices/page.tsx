import type { Metadata } from "next";
import { listInvoices } from "@/lib/db/invoices";
import { InvoicesScreen } from "./invoices-screen";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const rows = await listInvoices();
  return <InvoicesScreen rows={rows} />;
}
