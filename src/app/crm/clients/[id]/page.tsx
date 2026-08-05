import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/db/clients";
import { getSettings } from "@/lib/db/library";
import {
  listActivitiesForClient,
  listOpportunitiesForClient,
  listStages,
} from "@/lib/db/pipeline";
import { listQuotesForClient } from "@/lib/db/quotes";
import { ClientDetail } from "./client-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client?.name ?? "Client" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const client = await getClient(id);
  if (!client) notFound();

  // Fetched together rather than in sequence: none of these depend on each
  // other, and the page is worthless until all of them have landed.
  const [opportunities, stages, quotes, activities, settings] = await Promise.all([
    listOpportunitiesForClient(id),
    listStages(),
    listQuotesForClient(id),
    listActivitiesForClient(id),
    getSettings(),
  ]);

  return (
    <ClientDetail
      client={client}
      opportunities={opportunities}
      stages={stages}
      quotes={quotes}
      activities={activities}
      settings={{ follow_up_days: settings.follow_up_days }}
    />
  );
}
