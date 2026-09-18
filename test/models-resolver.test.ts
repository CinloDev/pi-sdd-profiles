import { describe, it, expect } from "vitest";
import {
  resolveAvailableModels,
  resolveModelsMetadata,
  getSupportedEffortsForModel,
  DEFAULT_EFFORT_OPTIONS,
} from "../src/models-resolver.js";

describe("models-resolver", () => {
  it("should resolve available models including standard fallbacks and user models", async () => {
    const models = await resolveAvailableModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain("anthropic/claude-sonnet-4-5");
    expect(models).toContain("openai/o3-mini");
  });

  it("should incorporate models and metadata from ctx.modelRegistry when provided", async () => {
    const mockCtx = {
      modelRegistry: {
        getAvailable: async () => [
          {
            provider: "mock-prov",
            id: "mock-model",
            reasoning: true,
            reasoningEfforts: ["low", "high"],
          },
        ],
      },
    };

    const models = await resolveAvailableModels(mockCtx);
    expect(models).toContain("mock-prov/mock-model");

    const metadata = await resolveModelsMetadata(mockCtx);
    expect(metadata["mock-prov/mock-model"]).toBeDefined();
    expect(metadata["mock-prov/mock-model"].reasoning).toBe(true);
    expect(metadata["mock-prov/mock-model"].reasoningEfforts).toEqual(["low", "high"]);
  });

  describe("getSupportedEffortsForModel", () => {
    it("should return all default options when modelId is undefined or empty", () => {
      const efforts = getSupportedEffortsForModel();
      expect(efforts).toEqual(DEFAULT_EFFORT_OPTIONS);
    });

    it("should return only ['default'] for non-reasoning models like gpt-4o", () => {
      const efforts = getSupportedEffortsForModel("openai/gpt-4o");
      expect(efforts).toEqual(["default"]);
    });

    it("should filter based on thinkingLevelMap with null holes", () => {
      const metadata = {
        "cliproxyapi/custom-reasoner": {
          id: "cliproxyapi/custom-reasoner",
          provider: "cliproxyapi",
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: null,
            low: "low",
            medium: null,
            high: "high",
            xhigh: null,
            max: null,
          },
        },
      };

      const efforts = getSupportedEffortsForModel("cliproxyapi/custom-reasoner", metadata);
      expect(efforts).toEqual(["default", "low", "high"]);
    });

    it("should filter based on reasoningEfforts array", () => {
      const metadata = {
        "cliproxyapi/cpa-model": {
          id: "cliproxyapi/cpa-model",
          provider: "cliproxyapi",
          reasoning: true,
          reasoningEfforts: ["low", "medium", "high"],
        },
      };

      const efforts = getSupportedEffortsForModel("cliproxyapi/cpa-model", metadata);
      expect(efforts).toEqual(["default", "low", "medium", "high"]);
    });

    it("should return ['default', 'low', 'medium', 'high', 'max'] for claude-sonnet-4-5", () => {
      const efforts = getSupportedEffortsForModel("anthropic/claude-sonnet-4-5");
      expect(efforts).toContain("default");
      expect(efforts).toContain("high");
      expect(efforts).toContain("max");
      expect(efforts).not.toContain("minimal");
    });

    it("should match models by id without provider prefix", () => {
      const metadata = {
        "provider-x/my-special-model": {
          id: "provider-x/my-special-model",
          provider: "provider-x",
          reasoning: true,
          reasoningEfforts: ["high"],
        },
      };

      const efforts = getSupportedEffortsForModel("my-special-model", metadata);
      expect(efforts).toEqual(["default", "high"]);
    });
  });
});
