import assert from "node:assert/strict";
import test from "node:test";

import { canAccessTenantResource } from "./tenant-access.js";

test("allows access inside the same tenant", () => {
  assert.equal(canAccessTenantResource("tenant-a", "tenant-a"), true);
});

test("rejects access across tenant boundaries after remediation", () => {
  assert.equal(canAccessTenantResource("tenant-a", "tenant-b"), false);
});
