import { describe, expect, it } from "vitest";
import { taskRequestSchema } from "./contracts";

describe("taskRequestSchema", () => {
  it("accepts a useful team task", () => {
    expect(taskRequestSchema.safeParse({ task: "Yeni dönem kayıt akışını planla" }).success).toBe(true);
  });

  it("rejects short tasks", () => {
    expect(taskRequestSchema.safeParse({ task: "Kısa" }).success).toBe(false);
  });
});
