"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icon";
import { PageHeader } from "@/components/crm/ui";
import type { JobTemplate, Settings, Snippet } from "@/lib/db/types";
import { BusinessTab } from "./business-tab";
import { ClausesTab } from "./clauses-tab";
import { DefaultsTab } from "./defaults-tab";
import { PriceBookTab, type PriceBookRow } from "./price-book-tab";
import { TemplatesTab } from "./templates-tab";

const TABS = [
  { id: "business", label: "Business", icon: "building-2" },
  { id: "defaults", label: "Defaults", icon: "sliders-horizontal" },
  { id: "pricebook", label: "Price book", icon: "book-open" },
  { id: "clauses", label: "Clause library", icon: "list-checks" },
  { id: "templates", label: "Templates", icon: "layout-template" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export interface SettingsScreenProps {
  settings: Settings;
  /** Short-lived signed URL for the stored logo, or null when none is set. */
  logoUrl: string | null;
  snippets: Snippet[];
  /** Includes archived rows so the tab can explain where a retired item went. */
  priceBook: PriceBookRow[];
  /** Age at which a cost is flagged, decided by the db layer, not by this screen. */
  staleAfterDays: number;
  templates: JobTemplate[];
}

export function SettingsScreen({
  settings,
  logoUrl,
  snippets,
  priceBook,
  staleAfterDays,
  templates,
}: SettingsScreenProps) {
  const [tab, setTab] = useState<TabId>("business");

  return (
    <div className="stack-6">
      <PageHeader
        title="Settings"
        description="Business details, quote defaults, and the libraries that feed every quote."
      />

      <div className="settings-grid">
        <nav className="settings-tabs" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab ${tab === t.id ? "is-active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "business" && <BusinessTab settings={settings} logoUrl={logoUrl} />}
        {tab === "defaults" && <DefaultsTab settings={settings} />}
        {tab === "pricebook" && (
          <PriceBookTab rows={priceBook} staleAfterDays={staleAfterDays} />
        )}
        {tab === "clauses" && <ClausesTab snippets={snippets} />}
        {tab === "templates" && <TemplatesTab templates={templates} />}
      </div>
    </div>
  );
}
