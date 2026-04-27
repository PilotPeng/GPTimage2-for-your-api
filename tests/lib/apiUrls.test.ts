import { describe, expect, it } from "vitest";
import { buildImageEndpointUrl, buildModelsEndpointUrl, inferApiBaseUrl } from "@/lib/server/apiUrls";

describe("api URL helpers", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com/v1"],
    ["https://api.example.com/v1", "https://api.example.com/v1"],
    ["https://api.example.com/v1/", "https://api.example.com/v1"],
    ["https://api.example.com/v1/images", "https://api.example.com/v1"],
    ["https://api.example.com/v1/images/generations", "https://api.example.com/v1"],
    ["https://api.example.com/v1/images/edits", "https://api.example.com/v1"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(inferApiBaseUrl(input)).toBe(expected);
  });

  it("builds the generation endpoint for text-only mode", () => {
    expect(buildImageEndpointUrl("https://api.example.com/v1", "generate")).toBe(
      "https://api.example.com/v1/images/generations",
    );
  });

  it.each(["reference", "edit"] as const)("builds the edits endpoint for %s mode", (mode) => {
    expect(buildImageEndpointUrl("https://api.example.com/v1", mode)).toBe("https://api.example.com/v1/images/edits");
  });

  it("builds a models endpoint for connectivity checks", () => {
    expect(buildModelsEndpointUrl("https://api.example.com/v1/images/generations")).toBe(
      "https://api.example.com/v1/models",
    );
  });
});
