import { ComingSoon } from "../coming-soon";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ComingSoon title="Settings" phase="Phase 2 — port the prototype">
      Business identity, GST and deposit switches, quote defaults, the price book
      and the clause library. Payment terms stay owner-supplied — never generated.
    </ComingSoon>
  );
}
