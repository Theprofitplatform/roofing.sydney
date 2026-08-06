import type { Metadata } from "next";
import "../crm/crm.css";
import "./portal.css";

/**
 * The portal's own layout.
 *
 * Deliberately NOT the CRM layout: this tree has no session, no sidebar and no
 * operator, and importing that layout would drag `getCurrentUser` into a page a
 * homeowner reaches with nothing but a link. It borrows only the stylesheet —
 * `.crm` carries the design tokens, `.portal` unwinds the shell grid those
 * tokens normally sit inside.
 */

export const metadata: Metadata = {
  title: "Your quote",
  // The token in the URL is a bearer credential. An indexed quote is a client's
  // pricing in a search result, so the portal opts out everywhere it can.
  robots: { index: false, follow: false, nocache: true },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="crm portal">{children}</div>;
}
