import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fmtBytes,
  fmtDay,
  fmtSchedule,
  jobValueCents,
  matchesJob,
  sortJobs,
  JOB_PILL_CLASS,
  JOB_STATUS_LABEL,
  JOB_STATUSES,
} from "../src/app/crm/jobs/job-view.ts";
import type { JobRow } from "../src/lib/db/jobs.ts";
import type { JobStatus } from "../src/lib/db/types.ts";

/**
 * The jobs screens derive everything they show from these functions, so the
 * cases that matter are the ones a roofing diary actually produces: a job with
 * no dates, a one-day job, and a date string that must not be dragged across a
 * timezone boundary on its way to the screen.
 */

interface JobFixture {
  id?: string;
  status?: JobStatus;
  start?: string | null;
  end?: string | null;
  createdAt?: string;
  quoteNumber?: string | null;
  clientName?: string;
  address?: string | null;
  roofType?: string | null;
}

const row = (over: JobFixture = {}): JobRow => ({
  job: {
    id: over.id ?? "job-1",
    quote_id: "quote-1",
    status: over.status ?? "scheduled",
    scheduled_start: over.start ?? null,
    scheduled_end: over.end ?? null,
    completed_at: null,
    crew_notes: null,
    created_at: over.createdAt ?? "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  quote: {
    id: "quote-1",
    // `in` rather than `??` throughout: a fixture that passes null is asking for
    // a missing field, and `??` would quietly hand back the default instead.
    quote_number: "quoteNumber" in over ? (over.quoteNumber ?? null) : "Q-2026-0001",
    roof_type: "roofType" in over ? (over.roofType ?? null) : "Colorbond re-roof",
    total_cents: 1_250_000,
    accepted_total_cents: null,
  },
  client: {
    id: "client-1",
    name: over.clientName ?? "Margaret Hale",
    phone: "0400 000 000",
    property_address:
      "address" in over ? (over.address ?? null) : "12 Kembla Street, Balmain NSW 2041",
  },
});

describe("fmtDay", () => {
  test("renders a schedule date as the day the operator typed", () => {
    assert.equal(fmtDay("2026-08-06"), "6 Aug 2026");
  });

  test("does not shift the date across a timezone boundary", () => {
    // The whole reason the function does not touch `Date`: UTC midnight on the
    // 1st is the previous month anywhere west of Greenwich, and the server and
    // the browser must not disagree about which day it is.
    assert.equal(fmtDay("2026-03-01"), "1 Mar 2026");
    assert.equal(fmtDay("2026-12-31T13:00:00.000Z"), "31 Dec 2026");
  });

  test("no date reads as an em dash rather than an empty cell", () => {
    assert.equal(fmtDay(null), "—");
    assert.equal(fmtDay(undefined), "—");
  });

  test("a malformed date is echoed back, never rendered as NaN", () => {
    assert.equal(fmtDay("not-a-date"), "not-a-date");
    assert.equal(fmtDay("2026-99-01"), "2026-99-01");
  });
});

describe("fmtSchedule", () => {
  test("a booked window reads as a range", () => {
    assert.equal(fmtSchedule("2026-08-06", "2026-08-09"), "6 Aug 2026 → 9 Aug 2026");
  });

  test("a one-day job is not written as a range against itself", () => {
    assert.equal(fmtSchedule("2026-08-06", "2026-08-06"), "6 Aug 2026");
  });

  test("a half-filled schedule still says something useful", () => {
    assert.equal(fmtSchedule("2026-08-06", null), "From 6 Aug 2026");
    assert.equal(fmtSchedule(null, "2026-08-09"), "Until 9 Aug 2026");
  });

  test("an unscheduled job says so plainly", () => {
    assert.equal(fmtSchedule(null, null), "Not scheduled");
  });
});

describe("sortJobs", () => {
  test("unscheduled jobs come first — they are the ones holding a decision", () => {
    const sorted = sortJobs([
      row({ id: "booked", start: "2026-08-06" }),
      row({ id: "unscheduled", start: null }),
      row({ id: "earlier", start: "2026-07-01" }),
    ]);
    assert.deepEqual(
      sorted.map((r) => r.job.id),
      ["unscheduled", "earlier", "booked"],
    );
  });

  test("two unscheduled jobs fall back to the order they were opened", () => {
    const sorted = sortJobs([
      row({ id: "second", createdAt: "2026-05-02T00:00:00.000Z" }),
      row({ id: "first", createdAt: "2026-05-01T00:00:00.000Z" }),
    ]);
    assert.deepEqual(
      sorted.map((r) => r.job.id),
      ["first", "second"],
    );
  });

  test("the input array is left untouched", () => {
    const input = [row({ id: "a", start: "2026-08-06" }), row({ id: "b", start: null })];
    sortJobs(input);
    assert.deepEqual(
      input.map((r) => r.job.id),
      ["a", "b"],
    );
  });
});

describe("matchesJob", () => {
  test("finds a job by any of quote number, client, address or roof type", () => {
    const job = row();
    assert.equal(matchesJob(job, "q-2026-0001"), true);
    assert.equal(matchesJob(job, "hale"), true);
    assert.equal(matchesJob(job, "balmain"), true);
    assert.equal(matchesJob(job, "colorbond"), true);
  });

  test("an empty term matches everything", () => {
    assert.equal(matchesJob(row(), ""), true);
  });

  test("missing fields do not throw and do not accidentally match", () => {
    const sparse = row({ quoteNumber: null, address: null, roofType: null });
    assert.equal(matchesJob(sparse, "balmain"), false);
    assert.equal(matchesJob(sparse, "hale"), true);
  });
});

describe("jobValueCents", () => {
  test("prefers what the client actually accepted", () => {
    assert.equal(
      jobValueCents({ total_cents: 1_250_000, accepted_total_cents: 1_410_000 }),
      1_410_000,
    );
  });

  test("falls back to the issued total when nothing was selected", () => {
    assert.equal(jobValueCents({ total_cents: 1_250_000, accepted_total_cents: null }), 1_250_000);
  });

  test("a quote with no figures at all is zero, never NaN or undefined", () => {
    assert.equal(jobValueCents({ total_cents: null, accepted_total_cents: null }), 0);
  });

  test("a genuinely zero accepted total is not mistaken for absent", () => {
    assert.equal(jobValueCents({ total_cents: 1_250_000, accepted_total_cents: 0 }), 0);
  });
});

describe("status vocabulary", () => {
  test("every job status has a label and a pill", () => {
    for (const status of JOB_STATUSES) {
      assert.ok(JOB_STATUS_LABEL[status], `${status} has no label`);
      assert.ok(JOB_PILL_CLASS[status], `${status} has no pill class`);
    }
  });

  test("cancelled drops the live status dot", () => {
    assert.match(JOB_PILL_CLASS.cancelled, /pill--no-dot/);
    assert.doesNotMatch(JOB_PILL_CLASS.scheduled, /pill--no-dot/);
  });
});

describe("fmtBytes", () => {
  test("scales through the units an operator recognises", () => {
    assert.equal(fmtBytes(512), "512 B");
    assert.equal(fmtBytes(2048), "2 KB");
    assert.equal(fmtBytes(5 * 1024 * 1024), "5.0 MB");
  });

  test("an empty file is zero bytes rather than a division by zero", () => {
    assert.equal(fmtBytes(0), "0 B");
  });
});
