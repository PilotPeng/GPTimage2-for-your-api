import { afterEach, describe, expect, it } from "vitest";
import { getRoutePath } from "@/lib/client/routePaths";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("routePaths", () => {
  it("keeps normal routes at root", () => {
    window.history.replaceState(null, "", "/account");

    expect(getRoutePath("/login")).toBe("/login");
    expect(getRoutePath("/")).toBe("/");
  });

  it("preserves the sealed prefix", () => {
    window.history.replaceState(null, "", "/sealed/account");

    expect(getRoutePath("/login")).toBe("/sealed/login");
    expect(getRoutePath("/")).toBe("/sealed");
  });

  it("preserves the fengzhuang prefix", () => {
    window.history.replaceState(null, "", "/fengzhuang/pay");

    expect(getRoutePath("/login")).toBe("/fengzhuang/login");
    expect(getRoutePath("/")).toBe("/fengzhuang");
  });
});
