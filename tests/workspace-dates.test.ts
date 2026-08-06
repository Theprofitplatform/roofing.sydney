import { test, describe } from "node:test";
import assert from "node:assert/strict";

/**
 * The module reads BUSINESS_TIMEZONE once, at import, and every expectation
 * below is a Sydney one. Pinning it here rather than inheriting the ambient
 * value is what stops the suite passing on a laptop and failing in a container
 * that sets the variable — the assertions would be measuring the environment
 * instead of the code. The import must therefore be dynamic; a static one is
 * hoisted above this assignment.
 */
process.env.BUSINESS_TIMEZONE = "Australia/Sydney";

const {
  bucketFor,
  dayDiff,
  dayKey,
  daysSince,
  formatDay,
  formatShortDay,
  relativeDay,
} = await import("../src/app/crm/_workspace/dates.ts");

/**
 * The pipeline, tasks and dashboard screens all decide "is this overdue" and "how
 * long has this sat here" from these helpers. The container runs on UTC and the
 * operator does not, so every assertion below pins an instant that falls on a
 * different calendar date in each — a naive implementation passes the easy cases
 * and quietly mis-buckets everything between 10am and midnight UTC.
 */
describe("dayKey", () => {
  test("reads the date in business time, not the server's", () => {
    // 15:00 UTC is already the next morning in Sydney.
    assert.equal(dayKey("2026-08-06T15:00:00.000Z"), "2026-08-07");
    assert.equal(dayKey("2026-08-06T09:00:00.000Z"), "2026-08-06");
  });

  test("holds across a year boundary", () => {
    assert.equal(dayKey("2025-12-31T14:00:00.000Z"), "2026-01-01");
  });

  test("throws on a value that is not a date", () => {
    assert.throws(() => dayKey("not-a-date"), RangeError);
  });
});

describe("dayDiff", () => {
  test("counts whole calendar days", () => {
    assert.equal(dayDiff("2026-08-06", "2026-08-09"), 3);
    assert.equal(dayDiff("2026-08-09", "2026-08-06"), -3);
    assert.equal(dayDiff("2026-08-06", "2026-08-06"), 0);
  });

  test("is unaffected by a daylight-saving transition", () => {
    // Sydney clocks go forward on 2026-10-04; the day in between is 23 hours long,
    // which is exactly what a timestamp subtraction would round wrongly.
    assert.equal(dayDiff("2026-10-03", "2026-10-05"), 2);
    // And back again on 2026-04-05, where the day is 25 hours long.
    assert.equal(dayDiff("2026-04-04", "2026-04-06"), 2);
  });
});

describe("daysSince", () => {
  test("counts elapsed days", () => {
    assert.equal(daysSince("2026-08-01T02:00:00.000Z", "2026-08-06"), 5);
  });

  test("never goes negative for a future timestamp", () => {
    assert.equal(daysSince("2026-09-01T02:00:00.000Z", "2026-08-06"), 0);
  });
});

describe("bucketFor", () => {
  const today = "2026-08-06";

  test("splits overdue, today and upcoming", () => {
    assert.equal(bucketFor("2026-08-05T12:00:00.000Z", today), "overdue");
    assert.equal(bucketFor("2026-08-06T12:00:00.000Z", today), "today");
    assert.equal(bucketFor("2026-08-07T12:00:00.000Z", today), "upcoming");
  });

  test("a task due late tonight is still due today, not overdue", () => {
    // 22:00 Sydney on the 6th — the moment a UTC-based bucket would call it the 7th.
    assert.equal(bucketFor("2026-08-06T12:00:00.000Z", today), "today");
    // 09:00 Sydney on the 7th — the moment a UTC-based bucket would still call it
    // the 6th, and hide a task that is due this morning.
    assert.equal(bucketFor("2026-08-06T23:00:00.000Z", today), "upcoming");
  });
});

describe("relativeDay", () => {
  test("phrases the recent past the way a person would", () => {
    const today = "2026-08-06";
    assert.equal(relativeDay("2026-08-06T02:00:00.000Z", today), "today");
    assert.equal(relativeDay("2026-08-05T02:00:00.000Z", today), "yesterday");
    assert.equal(relativeDay("2026-08-03T02:00:00.000Z", today), "3d ago");
  });
});

describe("formatting", () => {
  test("renders the business-local date, not the UTC one", () => {
    assert.match(formatDay("2026-08-06T15:00:00.000Z"), /7 Aug/);
    assert.match(formatShortDay("2026-08-06T15:00:00.000Z"), /7 Aug/);
  });
});
