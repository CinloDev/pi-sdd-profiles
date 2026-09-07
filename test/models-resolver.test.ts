import { describe, it, expect } from "vitest";
import { resolveAvailableModels } from "../src/models-resolver.js";

describe("models-resolver", () => {
  it("should resolve available models including standard fallbacks and user models", async () => {
    const models = await resolveAvailableModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain("anthropic/claude-sonnet-4-5");
    expect(models).toContain("openai/o3-mini");
  });

  it("should incorporate models from ctx.modelRegistry when provided", async () => {
    const mockCtx = {
      modelRegistry: {
        getAvailable: async () => [
          { provider: "mock-prov", id: "mock-model" },
        ],
      },
    };

    const models = await resolveAvailableModels(mockCtx);
    expect(models).toContain("mock-prov/mock-model");
  });
});
