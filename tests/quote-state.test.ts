import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  displayStatus,
  STATUS_LABEL,
  issuedAt,
  validUntil,
  daysBetween,
  quoteFlags,
  nudgeText,
  nudgeLevel,
  isAcceptable,
} from "../src/lib/quote-state.ts";
import type { Quote, QuoteStatus } from "../src/lib/db/types.ts";

const DAY_MS = 86_400_000;

/**
 * Every call below pins `now` explicitly. These flags are all "how long ago"
 * arithmetic, so a test that let the wall clock in would pass all afternoon and
 * fail overnight, and the failure would read as a flake rather than a bug.
 */
const NOW = new Date("2026-08-06T09:00:00.000Z");
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * DAY_MS).toISOString();

type StateQuote = Pick<Quote, "status" | "sent_at" | "created_at" | "valid_days" | "viewed_at">;

/** A quote sent two days ago, unopened, valid for the standard 30 days. */
const quote = (over: Partial<StateQuote> = {}): StateQuote => ({
  status: "sent",
  created_at: daysAgo(40),
  sent_at: daysAgo(2),
  viewed_at: null,
  valid_days: 30,
  ...over,
});

const ALL_STATUSES: QuoteStatus[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "superseded",
];

describe("displayStatus", () => {
  test("a sent quote the portal has recorded a view on displays as viewed", () => {
    assert.equal(displayStatus(quote({ status: "sent", viewed_at: daysAgo(1) })), "viewed");
  });

  test("a sent quote nobody has opened stays sent", () => {
    assert.equal(displayStatus(quote({ status: "sent", viewed_at: null })), "sent");
  });

  test("every other status passes through untouched, view or no view", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "sent")) {
      assert.equal(displayStatus(quote({ status, viewed_at: null })), status);
      assert.equal(
        displayStatus(quote({ status, viewed_at: daysAgo(1) })),
        status,
        `${status} must not be rewritten by a recorded view`,
      );
    }
  });

  test("every status has a label — a new status must not render blank", () => {
    for (const status of ALL_STATUSES) {
      assert.ok(STATUS_LABEL[status]?.length, `${status} needs a label`);
    }
    assert.equal(Object.keys(STATUS_LABEL).length, ALL_STATUSES.length);
  });
});

describe("validity dates", () => {
  test("validity is measured from the issue date, not from creation", () => {
    const q = quote({ created_at: daysAgo(40), sent_at: daysAgo(10), valid_days: 30 });
    assert.equal(issuedAt(q).toISOString(), daysAgo(10));
    assert.equal(validUntil(q).getTime(), NOW.getTime() + 20 * DAY_MS);
  });

  test("a draft has no issue date, so validity runs from creation", () => {
    const q = quote({ status: "draft", sent_at: null, created_at: daysAgo(5), valid_days: 30 });
    assert.equal(issuedAt(q).toISOString(), daysAgo(5));
    assert.equal(validUntil(q).getTime(), NOW.getTime() + 25 * DAY_MS);
  });

  test("edge: valid_days of zero falls back to the 30-day default", () => {
    const q = quote({ sent_at: daysAgo(0), valid_days: 0 });
    assert.equal(validUntil(q).getTime(), NOW.getTime() + 30 * DAY_MS);
  });

  test("daysBetween is whole days, negative into the past", () => {
    assert.equal(daysBetween(NOW, new Date(NOW.getTime() + 3 * DAY_MS)), 3);
    assert.equal(daysBetween(NOW, new Date(NOW.getTime() - 3 * DAY_MS)), -3);
    assert.equal(daysBetween(NOW, NOW), 0);
  });

  test("edge: daysBetween rounds to the nearest day rather than truncating", () => {
    assert.equal(daysBetween(NOW, new Date(NOW.getTime() + 2.6 * DAY_MS)), 3);
    assert.equal(daysBetween(NOW, new Date(NOW.getTime() + 2.4 * DAY_MS)), 2);
  });
});

describe("quoteFlags — follow-up", () => {
  test("sent longer ago than follow_up_days with no view needs chasing", () => {
    const f = quoteFlags(quote({ sent_at: daysAgo(8) }), { follow_up_days: 7 }, NOW);
    assert.equal(f.sentDays, 8);
    assert.equal(f.needsFollowUp, true);
    assert.equal(f.attention, true);
  });

  test("the same quote with a view recorded does not", () => {
    const f = quoteFlags(
      quote({ sent_at: daysAgo(8), viewed_at: daysAgo(6) }),
      { follow_up_days: 7 },
      NOW,
    );
    assert.equal(f.needsFollowUp, false);
    assert.equal(f.attention, false, "a client who opened it is not ignoring you");
  });

  test("a quote already promoted to viewed is never chased", () => {
    const f = quoteFlags(
      quote({ status: "viewed", sent_at: daysAgo(20), viewed_at: daysAgo(19) }),
      { follow_up_days: 7 },
      NOW,
    );
    assert.equal(f.needsFollowUp, false);
  });

  test("boundary: exactly follow_up_days old flags, one day younger does not", () => {
    const at = quoteFlags(quote({ sent_at: daysAgo(7) }), { follow_up_days: 7 }, NOW);
    const before = quoteFlags(quote({ sent_at: daysAgo(6) }), { follow_up_days: 7 }, NOW);
    assert.equal(at.needsFollowUp, true, "on the day counts");
    assert.equal(before.needsFollowUp, false);
  });

  test("follow_up_days is configurable, defaulting to 7 when settings are absent", () => {
    const q = quote({ sent_at: daysAgo(8) });
    assert.equal(quoteFlags(q, {}, NOW).needsFollowUp, true);
    assert.equal(quoteFlags(q, { follow_up_days: 14 }, NOW).needsFollowUp, false);
    assert.equal(quoteFlags(q, { follow_up_days: null }, NOW).needsFollowUp, true);
  });
});

describe("quoteFlags — expiry", () => {
  test("a viewed quote near expiry is expiring, not expired", () => {
    const f = quoteFlags(
      quote({ status: "viewed", sent_at: daysAgo(25), viewed_at: daysAgo(24), valid_days: 30 }),
      {},
      NOW,
    );
    assert.equal(f.daysLeft, 5);
    assert.equal(f.expiring, true);
    assert.equal(f.expired, false);
    assert.equal(f.attention, true);
  });

  test("past its date it is expired and no longer expiring", () => {
    const f = quoteFlags(quote({ sent_at: daysAgo(40), valid_days: 30 }), {}, NOW);
    assert.equal(f.daysLeft, -10);
    assert.equal(f.expired, true);
    assert.equal(f.expiring, false, "the two states are exclusive");
    assert.equal(f.attention, true);
  });

  test("boundary: zero days left is expiring today, not expired", () => {
    const f = quoteFlags(quote({ sent_at: daysAgo(30), valid_days: 30 }), {}, NOW);
    assert.equal(f.daysLeft, 0);
    assert.equal(f.expiring, true);
    assert.equal(f.expired, false);
  });

  test("boundary: seven days out is expiring, eight is not", () => {
    const seven = quoteFlags(quote({ sent_at: daysAgo(23), valid_days: 30 }), {}, NOW);
    const eight = quoteFlags(quote({ sent_at: daysAgo(22), valid_days: 30 }), {}, NOW);
    assert.equal(seven.daysLeft, 7);
    assert.equal(seven.expiring, true);
    assert.equal(eight.daysLeft, 8);
    assert.equal(eight.expiring, false);
  });

  test("a draft never expires, however old — nothing was ever promised", () => {
    const f = quoteFlags(
      quote({ status: "draft", sent_at: null, created_at: daysAgo(400), valid_days: 30 }),
      {},
      NOW,
    );
    assert.equal(f.sentDays, null);
    assert.ok(f.daysLeft < 0, "the date has passed on paper");
    assert.equal(f.expired, false);
    assert.equal(f.expiring, false);
    assert.equal(f.needsFollowUp, false);
    assert.equal(f.attention, false);
  });

  test("a settled quote is never flagged — chasing it would be noise", () => {
    for (const status of ["accepted", "declined", "superseded"] as QuoteStatus[]) {
      const f = quoteFlags(
        quote({ status, sent_at: daysAgo(400), valid_days: 30, viewed_at: null }),
        { follow_up_days: 7 },
        NOW,
      );
      assert.equal(f.needsFollowUp, false, `${status} must not be chased`);
      assert.equal(f.expired, false, `${status} must not be flagged expired`);
      assert.equal(f.expiring, false);
      assert.equal(f.attention, false);
    }
  });

  test("attention is the union of the three flags and nothing else", () => {
    const calm = quoteFlags(quote({ sent_at: daysAgo(2), valid_days: 30 }), {}, NOW);
    assert.deepEqual(
      [calm.needsFollowUp, calm.expiring, calm.expired, calm.attention],
      [false, false, false, false],
    );

    const chase = quoteFlags(quote({ sent_at: daysAgo(10) }), { follow_up_days: 7 }, NOW);
    assert.equal(chase.attention, chase.needsFollowUp || chase.expiring || chase.expired);
    assert.equal(chase.attention, true);
  });
});

describe("nudges", () => {
  const flagsFor = (over: Partial<StateQuote>, followUpDays = 7) =>
    quoteFlags(quote(over), { follow_up_days: followUpDays }, NOW);

  test("nothing to say returns null from both, not an empty string", () => {
    const f = flagsFor({ sent_at: daysAgo(2), valid_days: 30 });
    assert.equal(nudgeText(f), null);
    assert.equal(nudgeLevel(f), null);
  });

  test("an unopened, overdue quote reads as a follow-up warning", () => {
    const f = flagsFor({ sent_at: daysAgo(9), valid_days: 30 });
    assert.equal(nudgeText(f), "sent 9d ago — no view");
    assert.equal(nudgeLevel(f), "warning");
  });

  test("expiry counts down, and the last three days are critical", () => {
    const soon = flagsFor({ status: "viewed", sent_at: daysAgo(25), valid_days: 30 });
    assert.equal(nudgeText(soon), "expires in 5d");
    assert.equal(nudgeLevel(soon), "warning");

    const urgent = flagsFor({ status: "viewed", sent_at: daysAgo(28), valid_days: 30 });
    assert.equal(nudgeText(urgent), "expires in 2d");
    assert.equal(nudgeLevel(urgent), "critical");
  });

  test("zero days left says expires today rather than expires in 0d", () => {
    const f = flagsFor({ status: "viewed", sent_at: daysAgo(30), valid_days: 30 });
    assert.equal(nudgeText(f), "expires today");
    assert.equal(nudgeLevel(f), "critical");
  });

  test("expiry outranks follow-up when a quote is both — it is the worse news", () => {
    const f = flagsFor({ sent_at: daysAgo(40), valid_days: 30 });
    assert.equal(f.needsFollowUp, true);
    assert.equal(f.expired, true);
    assert.equal(nudgeText(f), "expired 10d ago");
    assert.equal(nudgeLevel(f), "critical");
  });

  test("the text and the level agree about whether there is anything to say", () => {
    const cases: Partial<StateQuote>[] = [
      { sent_at: daysAgo(2) },
      { sent_at: daysAgo(9) },
      { status: "viewed", sent_at: daysAgo(28) },
      { sent_at: daysAgo(40) },
      { status: "draft", sent_at: null, created_at: daysAgo(400) },
      { status: "accepted", sent_at: daysAgo(400) },
    ];
    for (const over of cases) {
      const f = flagsFor(over);
      assert.equal(
        nudgeText(f) === null,
        nudgeLevel(f) === null,
        `text and level disagree for ${JSON.stringify(over)}`,
      );
    }
  });
});

describe("isAcceptable", () => {
  test("an issued, unexpired, undecided quote may be accepted", () => {
    assert.equal(isAcceptable(quote({ status: "sent", sent_at: daysAgo(2) }), NOW), true);
    assert.equal(isAcceptable(quote({ status: "viewed", sent_at: daysAgo(2) }), NOW), true);
  });

  test("a draft cannot be accepted — nothing has been issued", () => {
    assert.equal(
      isAcceptable(quote({ status: "draft", sent_at: null, created_at: daysAgo(1) }), NOW),
      false,
    );
  });

  test("a decided or superseded quote cannot be accepted again", () => {
    for (const status of ["accepted", "declined", "superseded", "expired"] as QuoteStatus[]) {
      assert.equal(
        isAcceptable(quote({ status, sent_at: daysAgo(2) }), NOW),
        false,
        `${status} must not be acceptable`,
      );
    }
  });

  test("boundary: acceptable up to the instant of expiry, not one tick past it", () => {
    // This backs a server-side guard on money, so the boundary is asserted rather
    // than inferred: the client may accept on the last day and not a moment later.
    const q = quote({ status: "sent", sent_at: daysAgo(30), valid_days: 30 });
    assert.equal(validUntil(q).getTime(), NOW.getTime());
    assert.equal(isAcceptable(q, NOW), true, "expiring today is still acceptable");
    assert.equal(isAcceptable(q, new Date(NOW.getTime() + 1)), false, "one millisecond past is not");
  });

  test("failure: a long-expired quote is refused even while its status still says sent", () => {
    assert.equal(isAcceptable(quote({ status: "sent", sent_at: daysAgo(40) }), NOW), false);
  });
});
