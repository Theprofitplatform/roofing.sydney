/**
 * Shared placeholder for CRM screens that land in a later phase. Keeps the
 * shell's navigation honest — every link resolves, and says what it's waiting on.
 */
export function ComingSoon({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="crm-page">
      <header className="crm-page__head">
        <h1>{title}</h1>
        <p>{phase}</p>
      </header>
      <div className="crm-placeholder">
        <div className="crm-placeholder__title">Not built yet</div>
        <p>{children}</p>
      </div>
    </div>
  );
}
