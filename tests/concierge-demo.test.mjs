import assert from "node:assert/strict";
import test from "node:test";

import {
  conciergeDemoFixture,
  conciergeDemoQueue,
  hasCompleteConciergeDemoJourney,
  parseConciergeDemoState,
} from "../lib/concierge-demo.ts";

test("Concierge demo covers the complete human-reviewed journey", () => {
  assert.equal(hasCompleteConciergeDemoJourney(conciergeDemoFixture), true);
  assert.ok(conciergeDemoQueue.length >= 3);
  assert.ok(conciergeDemoFixture.invitations.length >= 2);
  assert.ok(conciergeDemoFixture.proposals.length >= 2);
  assert.ok(
    conciergeDemoFixture.proposals.every(
      (proposal) => proposal.qualityLabel && proposal.qualityReason,
    ),
  );
  assert.equal(conciergeDemoFixture.decision.status, "human_required");
});

test("Concierge demo uses synthetic, privacy-safe presentation data", () => {
  const serialized = JSON.stringify(conciergeDemoFixture);

  assert.doesNotMatch(serialized, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(serialized, /(?:\+?\d[\s().-]*){7,}/);
  assert.doesNotMatch(serialized, /service[_-]?role|authorization|bearer\s+/i);
});

test("Concierge demo exposes ready, empty and error states safely", () => {
  assert.equal(parseConciergeDemoState(), "ready");
  assert.equal(parseConciergeDemoState("ready"), "ready");
  assert.equal(parseConciergeDemoState("empty"), "empty");
  assert.equal(parseConciergeDemoState("error"), "error");
  assert.equal(parseConciergeDemoState("unexpected"), "ready");
});
