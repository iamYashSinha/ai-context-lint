import { describe, expect, it } from "vitest";

import { estimateTokens } from "../src/tokenizer.js";

describe("estimateTokens", () => {
  it("should count tokens using the o200k tokenizer", () => {
    expect(estimateTokens("hello world")).toBe(2);
  });

  it("should return zero for empty content", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should tokenize source code", () => {
    const source = `
      function add(a: number, b: number) {
        return a + b;
      }
    `;

    expect(estimateTokens(source)).toBeGreaterThan(0);
  });
});
