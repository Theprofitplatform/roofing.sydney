import { getCurrentUser } from "@/lib/supabase-server";

export default async function CrmDashboard() {
  const user = await getCurrentUser();

  return (
    <div className="crm-page">
      <header className="crm-page__head">
        <h1>Dashboard</h1>
        <p>Signed in as {user?.email}. The quoting workspace lands in Phase 2.</p>
      </header>

      <div className="crm-placeholder">
        <div className="crm-placeholder__title">Phase 0 — shell deployed</div>
        <p>
          Host routing, TLS, authentication and the container are live. Schema and
          RLS come next (Phase 1), then the quoting screens port across from the
          prototype in <code>design-reference/quoting-tool/</code>.
        </p>
        <ul className="crm-checklist">
          <li data-done="true">Docker image + standalone server</li>
          <li data-done="true">Host split — app.roofing.sydney → CRM</li>
          <li data-done="true">Supabase magic-link auth</li>
          <li data-done="false">Schema, RLS and seed data</li>
          <li data-done="false">Quotes, clients, settings screens</li>
        </ul>
      </div>
    </div>
  );
}
