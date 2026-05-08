import crypto from "node:crypto";
import { promisify } from "node:util";
import { AppError } from "./errors";
import { getAppStore, type AppUserRow } from "./appStore";
import type { AuthStateResponse, CurrentUser } from "@/lib/shared/types";
import type { ServerConfig } from "./config";

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE_NAME = "gpt_image2_session";
const PASSWORD_SCHEME = "scrypt";
const PASSWORD_KEY_LENGTH = 64;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60_000;
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_LOCK_MS = 15 * 60_000;

export type AuthenticatedUser = CurrentUser;

type LoginAttemptState = Readonly<{
  count: number;
  firstAttemptAt: number;
  lockedUntil: number;
}>;

type GlobalAuthState = typeof globalThis & {
  __gptImage2LoginAttempts?: Map<string, LoginAttemptState>;
};

const toIsoString = (timeMs: number) => new Date(timeMs).toISOString();

const toCurrentUser = (row: AppUserRow): CurrentUser => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastLoginAt: row.last_login_at,
});

const assertSessionSecret = (config: ServerConfig) => {
  if (config.sessionSecret.length < 32) {
    throw new AppError(500, "SESSION_SECRET_REQUIRED", "服务器未配置有效的 SESSION_SECRET。");
  }
};

const timingSafeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getLoginAttempts = () => {
  const globalAuthState = globalThis as GlobalAuthState;
  globalAuthState.__gptImage2LoginAttempts ??= new Map<string, LoginAttemptState>();
  return globalAuthState.__gptImage2LoginAttempts;
};

const normalizeLoginKeyPart = (value: string) => value.trim().toLowerCase() || "unknown";

const createLoginAttemptKey = (email: string, identifier = "unknown") => `${normalizeLoginKeyPart(email)}:${normalizeLoginKeyPart(identifier)}`;

const assertLoginAllowed = (key: string) => {
  const attempt = getLoginAttempts().get(key);
  const now = Date.now();

  if (!attempt) {
    return;
  }

  if (attempt.lockedUntil > now) {
    throw new AppError(429, "LOGIN_RATE_LIMITED", "登录失败次数过多，请稍后再试。");
  }

  if (now - attempt.firstAttemptAt > LOGIN_ATTEMPT_WINDOW_MS) {
    getLoginAttempts().delete(key);
  }
};

const recordFailedLogin = (key: string) => {
  const attempts = getLoginAttempts();
  const now = Date.now();
  const current = attempts.get(key);
  const resetCurrent = !current || now - current.firstAttemptAt > LOGIN_ATTEMPT_WINDOW_MS;
  const nextCount = resetCurrent ? 1 : current.count + 1;
  const firstAttemptAt = resetCurrent ? now : current.firstAttemptAt;
  const lockedUntil = nextCount >= LOGIN_ATTEMPT_LIMIT ? now + LOGIN_ATTEMPT_LOCK_MS : 0;

  attempts.set(key, { count: nextCount, firstAttemptAt, lockedUntil });
};

const clearFailedLogins = (key: string) => {
  getLoginAttempts().delete(key);
};

const getCookieValue = (request: Request, name: string) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const found = cookies.find((cookie) => cookie.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined;
};

export const getSessionCookieName = () => SESSION_COOKIE_NAME;

export const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return `${PASSWORD_SCHEME}$${salt}$${derivedKey.toString("hex")}`;
};

export const verifyPassword = async (password: string, passwordHash: string) => {
  const [scheme, salt, hash] = passwordHash.split("$");

  if (scheme !== PASSWORD_SCHEME || !salt || !hash) {
    return false;
  }

  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return timingSafeEqual(derivedKey.toString("hex"), hash);
};

export const hashSessionToken = (token: string, config: ServerConfig) => {
  assertSessionSecret(config);
  return crypto.createHmac("sha256", config.sessionSecret).update(token).digest("hex");
};

export const hashActivationCode = (code: string, config: ServerConfig) => {
  assertSessionSecret(config);
  return crypto.createHmac("sha256", config.sessionSecret).update(code.trim().toUpperCase()).digest("hex");
};

export const createSessionCookie = (token: string, expiresAt: string, config: ServerConfig) => {
  const secure = config.appBaseUrl.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
};

export const createExpiredSessionCookie = () => `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export const ensureBootstrapAdmin = async (config: ServerConfig) => {
  if (!config.billingEnabled || !config.adminBootstrapEmail.trim()) {
    return;
  }

  if (!config.adminBootstrapPassword.trim()) {
    throw new AppError(500, "ADMIN_BOOTSTRAP_PASSWORD_REQUIRED", "启用付费模式时必须配置管理员初始密码。");
  }

  const store = getAppStore(config.appDbPath);
  store.ensureBootstrapAdmin({
    email: config.adminBootstrapEmail,
    passwordHash: await hashPassword(config.adminBootstrapPassword),
    initialCredits: config.initialFreeCredits,
  });
};

const createUserSession = (userId: string, config: ServerConfig) => {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token, config);
  const expiresAt = toIsoString(Date.now() + config.sessionTtlDays * 86_400_000);
  const session = getAppStore(config.appDbPath).createSession({ userId, tokenHash, expiresAt });

  return { token, expiresAt: session.expiresAt } as const;
};

export const loginWithPassword = async (email: string, password: string, config: ServerConfig, attemptIdentifier?: string) => {
  assertSessionSecret(config);
  await ensureBootstrapAdmin(config);

  const attemptKey = createLoginAttemptKey(email, attemptIdentifier);
  assertLoginAllowed(attemptKey);

  const store = getAppStore(config.appDbPath);
  const user = store.getUserByEmail(email);

  if (!user || user.status !== "active" || !(await verifyPassword(password, user.password_hash))) {
    recordFailedLogin(attemptKey);
    throw new AppError(401, "INVALID_LOGIN", "邮箱或密码不正确。");
  }

  clearFailedLogins(attemptKey);

  const session = createUserSession(user.id, config);
  store.updateLastLogin(user.id);

  return {
    ...session,
    user: store.getCurrentUserById(user.id) ?? toCurrentUser(user),
  } as const;
};

export const registerWithPassword = async (email: string, password: string, config: ServerConfig) => {
  assertSessionSecret(config);

  if (!config.billingEnabled || !config.allowSelfRegistration) {
    throw new AppError(404, "REGISTRATION_DISABLED", "暂未开放注册。");
  }

  const store = getAppStore(config.appDbPath);

  if (store.getUserByEmail(email)) {
    throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "该邮箱已注册，请直接登录。");
  }

  const user = store.createUser({
    email,
    passwordHash: await hashPassword(password),
    initialCredits: config.initialFreeCredits,
  });
  const session = createUserSession(user.id, config);
  store.updateLastLogin(user.id);

  return {
    ...session,
    user: store.getCurrentUserById(user.id) ?? toCurrentUser(user),
  } as const;
};

export const getAuthState = async (request: Request, config: ServerConfig): Promise<AuthStateResponse> => {
  if (!config.billingEnabled) {
    return { authenticated: false, user: null, sessionExpiresAt: null };
  }

  await ensureBootstrapAdmin(config);

  const token = getCookieValue(request, SESSION_COOKIE_NAME);

  if (!token) {
    return { authenticated: false, user: null, sessionExpiresAt: null };
  }

  const store = getAppStore(config.appDbPath);
  store.cleanupExpiredSessions();
  const session = store.getSessionByTokenHash(hashSessionToken(token, config));

  if (!session || session.expires_at < toIsoString(Date.now())) {
    return { authenticated: false, user: null, sessionExpiresAt: null };
  }

  const user = store.getUserById(session.user_id);

  if (!user || user.status !== "active") {
    return { authenticated: false, user: null, sessionExpiresAt: null };
  }

  store.touchSession(session.id);

  return {
    authenticated: true,
    user: toCurrentUser(user),
    sessionExpiresAt: session.expires_at,
  };
};

export const requireUser = async (request: Request, config: ServerConfig): Promise<AuthenticatedUser> => {
  const authState = await getAuthState(request, config);

  if (!authState.user) {
    throw new AppError(401, "LOGIN_REQUIRED", "请先登录后再生成图片。");
  }

  return authState.user;
};

export const requireAdmin = async (request: Request, config: ServerConfig) => {
  const user = await requireUser(request, config);

  if (user.role !== "admin") {
    throw new AppError(403, "ADMIN_REQUIRED", "需要管理员权限。");
  }

  return user;
};

export const logoutRequest = (request: Request, config: ServerConfig) => {
  const token = getCookieValue(request, SESSION_COOKIE_NAME);

  if (!token || !config.sessionSecret) {
    return;
  }

  getAppStore(config.appDbPath).deleteSession(hashSessionToken(token, config));
};

export const resetLoginAttemptStateForTests = () => {
  getLoginAttempts().clear();
};
