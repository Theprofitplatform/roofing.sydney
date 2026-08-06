/**
 * A sliding-window limiter for the portal's write paths.
 *
 * Scope, stated plainly: this counts in the process's own memory. One container
 * is one bucket, so a second replica behind the same nginx would double the
 * effective allowance and a restart forgives everyone. That is proportionate for
 * a single-operator CRM on one box — the thing being protected is a signature
 * form, not a login. Move the counter to Postgres or Redis the day the app runs
 * more than one instance.
 *
 * The read path is deliberately NOT limited here. A homeowner refreshing the
 * quote they are about to sign must never be locked out of it.
 */

export interface LimiterOptions {
  /** Attempts allowed inside the window. */
  limit: number;
  windowMs: number;
}

export interface LimitVerdict {
  ok: boolean;
  /** Seconds until the oldest attempt falls out of the window. Zero when ok. */
  retryAfterSeconds: number;
}

export interface Limiter {
  check(key: string, now?: number): LimitVerdict;
}

/** Sweep idle keys every so many checks so the Map cannot grow without bound. */
const SWEEP_EVERY = 200;

export function createLimiter({ limit, windowMs }: LimiterOptions): Limiter {
  const hits = new Map<string, number[]>();
  let sinceSweep = 0;

  const sweep = (now: number) => {
    for (const [key, times] of hits) {
      if (times.length === 0 || times[times.length - 1] <= now - windowMs) hits.delete(key);
    }
  };

  return {
    check(key, now = Date.now()) {
      if (++sinceSweep >= SWEEP_EVERY) {
        sinceSweep = 0;
        sweep(now);
      }

      const cutoff = now - windowMs;
      const times = (hits.get(key) ?? []).filter((t) => t > cutoff);

      if (times.length >= limit) {
        // Retry when the oldest attempt in the window expires, rounded up so a
        // caller told "1 second" does not come back to another refusal.
        hits.set(key, times);
        return { ok: false, retryAfterSeconds: Math.ceil((times[0] - cutoff) / 1000) };
      }

      times.push(now);
      hits.set(key, times);
      return { ok: true, retryAfterSeconds: 0 };
    },
  };
}

/**
 * Accept and decline share one budget, keyed by IP. Generous enough that a
 * client who mistypes their name a few times is unaffected, tight enough that
 * the endpoint is not a free signature-writing loop.
 */
export const decisionLimiter = createLimiter({ limit: 10, windowMs: 10 * 60_000 });

/**
 * The client's address, from the first hop of `x-forwarded-for`.
 *
 * The header is attacker-controlled up to the point nginx rewrites it, so the
 * value is validated before it goes anywhere near an `inet` column: a junk
 * header must degrade to "unknown", not fail the acceptance it accompanies.
 */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;

const isIpv4 = (value: string) =>
  IPV4.test(value) && value.split(".").every((octet) => Number(octet) <= 255);

export function clientIp(
  forwardedFor: string | null,
  realIp: string | null = null,
): string | null {
  // The portal link points at the PUBLIC hostname, whose vhost is not in this
  // repo — so we cannot assume it sets `x-forwarded-for`. Without a fallback,
  // every homeowner collapses into one shared bucket and the tenth signature of
  // the day is refused for someone who has signed nothing. `x-real-ip` is the
  // other header nginx conventionally sets; try it before giving up.
  const first =
    (forwardedFor ?? "").split(",")[0]?.trim() || (realIp ?? "").trim();
  if (!first) return null;

  // IPv6 arrives bracketed when a port rides along: [2001:db8::1]:443.
  const bracketed = first.match(/^\[([0-9a-f:.]+)\]/i);
  const bare = bracketed ? bracketed[1] : first;

  if (isIpv4(bare)) return bare;
  if (bare.includes(":") && IPV6.test(bare)) return bare;

  // Some proxies append a port to IPv4 without brackets: 203.0.113.9:44321.
  const [host] = bare.split(":");
  return isIpv4(host) ? host : null;
}
