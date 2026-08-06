import { revalidatePath } from "next/cache";

/**
 * Cache invalidation for CRM routes.
 *
 * The CRM is served through a host rewrite: `app.roofing.sydney/quotes` renders
 * `src/app/crm/quotes`. Links must use the bare form, because that is the URL in
 * the address bar — but `revalidatePath` keys on the App Router path, which is
 * the rewritten one. `revalidatePath("/quotes")` therefore invalidates nothing
 * at all, silently.
 *
 * Today that costs nothing: the CRM layout is `force-dynamic`, so no CRM page is
 * cached in the first place. The trap is the day someone removes that line to
 * speed up a list — half the app would start serving stale data with no obvious
 * cause. Routing every call through here means the bare paths that read
 * naturally at the call site always land on the route that actually exists.
 */
export function revalidateCrm(...paths: string[]): void {
  for (const path of paths) {
    const logical = path.startsWith("/") ? path : `/${path}`;
    // Idempotent: a caller that already knows the real path is left alone.
    const routePath = logical.startsWith("/crm")
      ? logical
      : `/crm${logical === "/" ? "" : logical}`;
    revalidatePath(routePath);
  }
}

/**
 * The client portal renders from the public tree, not the CRM one, so its paths
 * are already real routes and must NOT be prefixed.
 */
export function revalidatePortal(token: string): void {
  revalidatePath(`/q/${token}`);
}
