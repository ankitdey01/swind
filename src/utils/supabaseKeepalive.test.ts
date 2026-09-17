import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INTERVAL_MS,
  MAX_INTERVAL_MS,
  MIN_INTERVAL_MS,
  resolveKeepaliveIntervalMs,
} from "./supabaseKeepalive.js";

test("unset env → default interval", () => {
  assert.equal(resolveKeepaliveIntervalMs(undefined), DEFAULT_INTERVAL_MS);
});

test("non-numeric, empty, zero, and negative → default interval", () => {
  for (const raw of ["not-a-number", "", "0", "-1000", "-Infinity"]) {
    assert.equal(resolveKeepaliveIntervalMs(raw), DEFAULT_INTERVAL_MS, `raw=${raw}`);
  }
});

test("small positive → clamped to MIN_INTERVAL_MS", () => {
  assert.equal(resolveKeepaliveIntervalMs("1000"), MIN_INTERVAL_MS);
  assert.equal(resolveKeepaliveIntervalMs(String(MIN_INTERVAL_MS - 1)), MIN_INTERVAL_MS);
  assert.equal(resolveKeepaliveIntervalMs(String(MIN_INTERVAL_MS)), MIN_INTERVAL_MS);
});

test("valid value → used as-is", () => {
  assert.equal(resolveKeepaliveIntervalMs("3600000"), 3600000);
});

test("value above Node max timer delay → clamped to MAX_INTERVAL_MS", () => {
  assert.equal(resolveKeepaliveIntervalMs("9999999999999"), MAX_INTERVAL_MS);
});
