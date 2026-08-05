import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase-server";
import { SignOutButton } from "./sign-out-button";
import "./crm.css";

export const metadata: Metadata = {
  title: { default: "Quoting — ARC", template: "%s — ARC Quoting" },
  robots: { index: false, follow: false },
};

// Everything under the CRM is per-operator and session-dependent — never
// prerender it. Without this the build tries to statically export /crm.
export const dynamic = "force-dynamic";

const NAV = [
  { group: "Workspace", items: [
    { href: "/", label: "Dashboard" },
    { href: "/quotes", label: "Quotes" },
    { href: "/clients", label: "Clients" },
  ]},
  { group: "Business", items: [
    { href: "/settings", label: "Settings" },
  ]},
];

export default async function CrmLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  // Unauthenticated routes (/login, /auth/*) render bare — middleware has
  // already decided they're allowed through.
  if (!user) return <>{children}</>;

  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="crm">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <span className="crm-brand__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5 10.2V20h14v-9.8" />
              <path d="M9.5 20v-5.5h5V20" />
            </svg>
          </span>
          <div className="crm-brand__text">
            <div className="crm-brand__name">Australian Roofing Contractors</div>
            <div className="crm-brand__tag">Quoting · Internal</div>
          </div>
        </div>

        <nav className="crm-nav">
          {NAV.map((g) => (
            <div key={g.group} className="crm-nav__group">
              <div className="crm-nav__label">{g.group}</div>
              <ul>
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="crm-nav__item">{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="crm-foot">
          <span className="crm-foot__avatar">{initials}</span>
          <div className="crm-foot__id">
            <div className="crm-foot__name">{user.email}</div>
            <div className="crm-foot__role">Owner</div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="crm-main">{children}</main>
    </div>
  );
}
