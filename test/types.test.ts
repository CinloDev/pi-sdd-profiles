import { describe, it, expect } from "vitest";
import { parseReasoningEffort, REASONING_EFFORTS } from "../src/types.js";

describe("types: REASONING_EFFORTS and parseReasoningEffort", () => {
  it("should contain all valid Pi reasoning effort levels", () => {
    expect(REASONING_EFFORTS).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("should return valid reasoning effort when exact match", () => {
    for (const effort of REASONING_EFFORTS) {
      expect(parseReasoningEffort(effort)).toBe(effort);
    }
  });

  it("should normalize uppercase and whitespace", () => {
    expect(parseReasoningEffort("  HIGH  ")).toBe("high");
    expect(parseReasoningEffort("MEDIUM")).toBe("medium");
    expect(parseReasoningEffort("  Low ")).toBe("low");
  });

  it("should normalize default/reset tokens to undefined", () => {
    const defaultTokens = ["default", "predeterminado", "heredar", "none", "-", "unset", ""];
    for (const token of defaultTokens) {
      expect(parseReasoningEffort(token)).toBeUndefined();
      expect(parseReasoningEffort(token.toUpperCase())).toBeUndefined();
    }
    expect(parseReasoningEffort(undefined)).toBeUndefined();
    expect(parseReasoningEffort(null)).toBeUndefined();
  });

  it("should throw on invalid effort when strict is true", () => {
    expect(() => parseReasoningEffort("invalid_effort")).toThrowError(
      /Nivel de esfuerzo inválido: "invalid_effort"/
    );
    expect(() => parseReasoningEffort(123 as any)).toThrowError(
      /Nivel de esfuerzo inválido/
    );
  });

  it("should return undefined on invalid effort when strict is false", () => {
    expect(parseReasoningEffort("invalid_effort", false)).toBeUndefined();
    expect(parseReasoningEffort(123 as any, false)).toBeUndefined();
  });
});
