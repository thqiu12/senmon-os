import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("student application detail requires application number, email, and target id", () => {
  const source = read("app/api/applications/[id]/route.ts");
  assert.match(source, /verifyApplicationStudentAccess\(id,\s*applicationNo,\s*email\)/);
  assert.doesNotMatch(source, /application\.email\s*!==\s*email/);
});

test("student uploads cannot authenticate with bare applicationId", () => {
  const source = read("app/api/upload/route.ts");
  assert.match(source, /applicationNo\s*&&\s*email/);
  assert.doesNotMatch(source, /else if \(applicationId\)/);
  assert.doesNotMatch(source, /ownerId\s*=\s*applicationId/);
});

test("student fee updates and final submit require applicationNo and email", () => {
  const feeRoute = read("app/api/applications/[id]/fee/route.ts");
  const submitRoute = read("app/api/applications/[id]/submit/route.ts");
  assert.match(feeRoute, /application\.applicationNo\s*!==\s*applicationNo/);
  assert.match(feeRoute, /application\.email\s*!==\s*email/);
  assert.match(submitRoute, /application\.applicationNo\s*!==\s*applicationNo/);
  assert.match(submitRoute, /application\.email\s*!==\s*email/);
});

test("admin account updates validate roles and preserve at least one active super admin", () => {
  const source = read("app/api/admin/accounts/route.ts");
  assert.match(source, /isAdminRole\(body\.role\)/);
  assert.match(source, /最後のsuper_admin/);
});

test("production prisma client does not log every query", () => {
  const source = read("lib/prisma.ts");
  assert.match(source, /NODE_ENV\s*===\s*"production"\s*\?\s*\["warn",\s*"error"\]/);
});
