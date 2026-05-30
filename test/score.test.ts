// test/score.test.ts
import { describe, it, expect } from "vitest";
import { computeScore } from "../src/score";

describe("computeScore", () => {
  it("is 100 when there are no checks", () => {
    expect(computeScore(0, 0)).toBe(100);
  });
  it("is 100 when there are checks but no errors", () => {
    expect(computeScore(0, 10)).toBe(100);
  });
  it("is the rounded pass percentage", () => {
    expect(computeScore(2, 10)).toBe(80);
    expect(computeScore(1, 3)).toBe(67);
  });
  it("is 0 when every check fails", () => {
    expect(computeScore(5, 5)).toBe(0);
  });
});
