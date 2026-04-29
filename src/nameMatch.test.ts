import assert from "node:assert/strict";
import { test } from "node:test";
import { findMatchingProfileId, normalizeName } from "./nameMatch.ts";

test("normalizeName lowercases, trims and strips accents", () => {
  assert.equal(normalizeName("  Corentin "), "corentin");
  assert.equal(normalizeName("CORENTIN"), "corentin");
  assert.equal(normalizeName("Coréntîn"), "corentin");
  assert.equal(normalizeName(""), "");
  assert.equal(normalizeName("   "), "");
});

test("findMatchingProfileId matches regardless of case, accents and spacing", () => {
  const profiles = [
    { id: "id-b", name: "Corentin" },
    { id: "id-a", name: "corentin" },
  ];
  // Existing profile must be recovered even with different casing/spacing.
  assert.equal(findMatchingProfileId("  CORENTIN ", profiles), "id-a"); // smallest id, deterministic
  assert.equal(findMatchingProfileId("Corentin", profiles), "id-a");
});

test("findMatchingProfileId returns null when nothing matches", () => {
  const profiles = [{ id: "id-1", name: "Alice" }];
  assert.equal(findMatchingProfileId("Bob", profiles), null);
  assert.equal(findMatchingProfileId("   ", profiles), null);
});

test("findMatchingProfileId ignores non-string names", () => {
  const profiles = [
    { id: "id-1", name: 42 },
    { id: "id-2", name: "Corentin" },
  ];
  assert.equal(findMatchingProfileId("corentin", profiles), "id-2");
});
