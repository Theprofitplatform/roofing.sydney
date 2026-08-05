import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Quotes" };

export default function QuotesPage() {
  return (
    <ComingSoon title="Quotes" phase="Phase 2 — port the prototype">
      The quotes list, builder and PDF view port across from
      <code> design-reference/quoting-tool/</code> once the schema and RLS land
      in Phase 1. The cost-in/margin-out engine comes over verbatim.
    </ComingSoon>
  );
}
