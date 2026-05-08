// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as LOGIN } from "@/app/api/auth/login/route";
import { GET as ME } from "@/app/api/auth/me/route";
import { POST as REGISTER } from "@/app/api/auth/register/route";
import { resetLoginAttemptStateForTests } from "@/lib/server/auth";
import { resetAppStoreCache } from "@/lib/server/appStore";

let tempDir = "";

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpt-image2-auth-api-"));
  process.env.BILLING_ENABLED = "true";
  process.env.APP_DB_PATH = path.join(tempDir, "app.sqlite");
  process.env.SESSION_SECRET = "test-session-secret-that-is-long-enough";
  process.env.ADMIN_BOOTSTRAP_EMAIL = "admin@example.com";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "password123";
  process.env.ALLOW_SELF_REGISTRATION = "false";
  process.env.INITIAL_FREE_CREDITS = "0";
});

afterEach(() => {
  resetLoginAttemptStateForTests();
  resetAppStoreCache();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("auth API", () => {
  it("logs in and returns current user", async () => {
    const loginResponse = await LOGIN(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
    }));
    const loginBody = await loginResponse.json();
    const cookie = loginResponse.headers.get("Set-Cookie") ?? "";

    expect(loginResponse.status).toBe(200);
    expect(loginBody.user.email).toBe("admin@example.com");

    const meResponse = await ME(new Request("http://localhost/api/auth/me", { headers: { cookie } }));
    const meBody = await meResponse.json();

    expect(meBody.authenticated).toBe(true);
    expect(meBody.user.role).toBe("admin");
  });

  it("returns 429 after repeated failed login attempts", async () => {
    for (const attempt of [1, 2, 3, 4, 5]) {
      const response = await LOGIN(new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.10" },
        body: JSON.stringify({ email: "admin@example.com", password: `wrong-${attempt}` }),
      }));

      expect(response.status).toBe(401);
    }

    const limitedResponse = await LOGIN(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
      body: JSON.stringify({ email: "admin@example.com", password: "password123" }),
    }));
    const body = await limitedResponse.json();

    expect(limitedResponse.status).toBe(429);
    expect(body.error.code).toBe("LOGIN_RATE_LIMITED");
  });

  it("registers a user when self registration is enabled", async () => {
    process.env.ALLOW_SELF_REGISTRATION = "true";
    process.env.INITIAL_FREE_CREDITS = "7";

    const registerResponse = await REGISTER(new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "password123" }),
    }));
    const registerBody = await registerResponse.json();
    const cookie = registerResponse.headers.get("Set-Cookie") ?? "";

    expect(registerResponse.status).toBe(201);
    expect(registerBody.user.email).toBe("new@example.com");

    const meResponse = await ME(new Request("http://localhost/api/auth/me", { headers: { cookie } }));
    const meBody = await meResponse.json();

    expect(meBody.authenticated).toBe(true);
    expect(meBody.user.email).toBe("new@example.com");
  });

  it("rejects duplicate registration with normalized email", async () => {
    process.env.ALLOW_SELF_REGISTRATION = "true";

    const firstResponse = await REGISTER(new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "duplicate@example.com", password: "password123" }),
    }));
    const duplicateResponse = await REGISTER(new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: " DUPLICATE@example.com ", password: "password123" }),
    }));
    const body = await duplicateResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(duplicateResponse.status).toBe(409);
    expect(body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("rejects registration when self registration is disabled", async () => {
    const registerResponse = await REGISTER(new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "password123" }),
    }));
    const body = await registerResponse.json();

    expect(registerResponse.status).toBe(404);
    expect(body.error.code).toBe("REGISTRATION_DISABLED");
  });
});
