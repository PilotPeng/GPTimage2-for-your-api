import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { AppError } from "./errors";
import type {
  AccountLedgerEntry,
  AccountSummaryResponse,
  ActivationCodeSummary,
  AdminUserSummary,
  CurrentUser,
  PaymentOrderStatus,
  PaymentOrderSummary,
  PaymentProvider,
  Role,
  UserStatus,
} from "@/lib/shared/types";

export type AppUserRow = Readonly<{
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}>;

type SessionRow = Readonly<{
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string | null;
}>;

type LedgerRow = Readonly<{
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  type: string;
  reference_type: string | null;
  reference_id: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}>;

type OrderRow = Readonly<{
  id: string;
  user_id: string;
  provider: PaymentProvider;
  provider_order_id: string | null;
  status: PaymentOrderStatus;
  pack_id: string;
  amount_cents: number;
  currency: string;
  credits: number;
  checkout_url: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
}>;

type AdminUserRow = Readonly<{
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  balance: number;
  created_at: string;
  last_login_at: string | null;
}>;

type ActivationCodeRow = Readonly<{
  id: string;
  credits: number;
  max_redemptions: number;
  redeemed_count: number;
  expires_at: string | null;
  disabled_at: string | null;
  created_at: string;
}>;

type GenerationChargeRow = Readonly<{
  job_id: string;
  user_id: string;
  cost: number;
  status: "reserved" | "charged" | "refunded";
  debit_ledger_id: string;
  refund_ledger_id: string | null;
  created_at: string;
  updated_at: string;
}>;

type PaymentPackInput = Readonly<{
  id: string;
  credits: number;
  amountCents: number;
  currency: string;
}>;

type CreateOrderInput = Readonly<{
  id: string;
  userId: string;
  provider: PaymentProvider;
  providerOrderId?: string;
  pack: PaymentPackInput;
  checkoutUrl: string;
  expiresAt: string;
}>;

type PaymentEventInput = Readonly<{
  id: string;
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  payloadJson: string;
}>;

const toIsoString = (timeMs: number) => new Date(timeMs).toISOString();
const nowIso = () => toIsoString(Date.now());

const createId = (prefix: string) => {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isUniqueEmailViolation = (error: unknown) => error instanceof Error
  && "code" in error
  && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  && error.message.includes("users.email");

const toCurrentUser = (row: AppUserRow): CurrentUser => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastLoginAt: row.last_login_at,
});

const toLedgerEntry = (row: LedgerRow): AccountLedgerEntry => ({
  id: row.id,
  delta: row.delta,
  balanceAfter: row.balance_after,
  type: row.type,
  referenceType: row.reference_type,
  referenceId: row.reference_id,
  memo: row.memo,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const toOrderSummary = (row: OrderRow): PaymentOrderSummary => ({
  id: row.id,
  userId: row.user_id,
  provider: row.provider,
  providerOrderId: row.provider_order_id,
  status: row.status,
  packId: row.pack_id,
  amountCents: row.amount_cents,
  currency: row.currency,
  credits: row.credits,
  checkoutUrl: row.checkout_url,
  createdAt: row.created_at,
  paidAt: row.paid_at,
  expiresAt: row.expires_at,
});

const toAdminUserSummary = (row: AdminUserRow): AdminUserSummary => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  balance: row.balance,
  createdAt: row.created_at,
  lastLoginAt: row.last_login_at,
});

const toActivationCodeSummary = (row: ActivationCodeRow): ActivationCodeSummary => ({
  id: row.id,
  credits: row.credits,
  maxRedemptions: row.max_redemptions,
  redeemedCount: row.redeemed_count,
  expiresAt: row.expires_at,
  disabledAt: row.disabled_at,
  createdAt: row.created_at,
});

export class AppStore {
  private readonly database: Database.Database;

  constructor(private readonly databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.initializeSchema();
  }

  close() {
    this.database.close();
  }

  createUser(input: Readonly<{ email: string; passwordHash: string; role?: Role; initialCredits: number }>) {
    const now = nowIso();
    const id = createId("user");
    const email = normalizeEmail(input.email);

    try {
      this.database.transaction(() => {
        this.database.prepare(`
          INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at, last_login_at)
          VALUES (@id, @email, @passwordHash, @role, 'active', @now, @now, NULL)
        `).run({ id, email, passwordHash: input.passwordHash, role: input.role ?? "user", now });

        this.database.prepare(`
          INSERT INTO credit_accounts (user_id, balance, created_at, updated_at)
          VALUES (@userId, 0, @now, @now)
        `).run({ userId: id, now });

        if (input.initialCredits > 0) {
          this.addCredits({
            userId: id,
            delta: input.initialCredits,
            type: "admin_credit",
            referenceType: "bootstrap",
            referenceId: id,
            idempotencyKey: `bootstrap:${id}`,
            memo: "初始赠送额度",
            createdBy: null,
          });
        }
      })();
    } catch (error) {
      if (isUniqueEmailViolation(error)) {
        throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "该邮箱已注册，请直接登录。");
      }

      throw error;
    }

    const user = this.getUserById(id);

    if (!user) {
      throw new AppError(500, "USER_CREATE_FAILED", "创建用户失败，请稍后重试。");
    }

    return user;
  }

  ensureBootstrapAdmin(input: Readonly<{ email: string; passwordHash: string; initialCredits: number }>) {
    if (!input.email.trim()) {
      return;
    }

    const adminCount = this.database
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
      .get() as { count: number };

    if (adminCount.count > 0) {
      return;
    }

    this.createUser({
      email: input.email,
      passwordHash: input.passwordHash,
      role: "admin",
      initialCredits: input.initialCredits,
    });
  }

  getUserByEmail(email: string) {
    return this.database
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(normalizeEmail(email)) as AppUserRow | undefined;
  }

  getUserById(userId: string) {
    return this.database
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(userId) as AppUserRow | undefined;
  }

  getCurrentUserById(userId: string) {
    const user = this.getUserById(userId);
    return user ? toCurrentUser(user) : undefined;
  }

  updateLastLogin(userId: string) {
    const now = nowIso();
    this.database.prepare("UPDATE users SET last_login_at = @now, updated_at = @now WHERE id = @userId").run({ userId, now });
  }

  createSession(input: Readonly<{ userId: string; tokenHash: string; expiresAt: string }>) {
    const id = createId("session");
    const now = nowIso();
    this.database.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
      VALUES (@id, @userId, @tokenHash, @expiresAt, @now, @now)
    `).run({ id, userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt, now });

    return { id, expiresAt: input.expiresAt } as const;
  }

  getSessionByTokenHash(tokenHash: string) {
    return this.database
      .prepare("SELECT * FROM sessions WHERE token_hash = ?")
      .get(tokenHash) as SessionRow | undefined;
  }

  touchSession(sessionId: string) {
    this.database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), sessionId);
  }

  deleteSession(tokenHash: string) {
    this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  cleanupExpiredSessions() {
    this.database.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso());
  }

  getBalance(userId: string) {
    const row = this.database
      .prepare("SELECT balance FROM credit_accounts WHERE user_id = ?")
      .get(userId) as { balance: number } | undefined;

    return row?.balance ?? 0;
  }

  addCredits(input: Readonly<{
    userId: string;
    delta: number;
    type: string;
    referenceType?: string;
    referenceId?: string;
    idempotencyKey: string;
    memo?: string;
    createdBy?: string | null;
  }>) {
    const existing = this.database
      .prepare("SELECT * FROM credit_ledger WHERE idempotency_key = ?")
      .get(input.idempotencyKey) as LedgerRow | undefined;

    if (existing) {
      return toLedgerEntry(existing);
    }

    const now = nowIso();
    const ledgerId = createId("ledger");
    const currentBalance = this.getBalance(input.userId);
    const nextBalance = currentBalance + input.delta;

    if (nextBalance < 0) {
      throw new AppError(402, "INSUFFICIENT_CREDITS", "额度不足，请先充值。");
    }

    this.database.prepare(`
      UPDATE credit_accounts SET balance = @balance, updated_at = @now WHERE user_id = @userId
    `).run({ userId: input.userId, balance: nextBalance, now });

    this.database.prepare(`
      INSERT INTO credit_ledger (
        id, user_id, delta, balance_after, type, reference_type, reference_id,
        idempotency_key, memo, created_by, created_at
      ) VALUES (
        @id, @userId, @delta, @balanceAfter, @type, @referenceType, @referenceId,
        @idempotencyKey, @memo, @createdBy, @now
      )
    `).run({
      id: ledgerId,
      userId: input.userId,
      delta: input.delta,
      balanceAfter: nextBalance,
      type: input.type,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo ?? null,
      createdBy: input.createdBy ?? null,
      now,
    });

    return toLedgerEntry(this.database
      .prepare("SELECT * FROM credit_ledger WHERE id = ?")
      .get(ledgerId) as LedgerRow);
  }

  reserveGenerationCredits(input: Readonly<{ userId: string; jobId: string; cost: number; imageJobExists: boolean }>) {
    return this.database.transaction(() => {
      const existing = this.getGenerationCharge(input.jobId);

      if (existing) {
        if (existing.user_id !== input.userId) {
          throw new AppError(409, "JOB_ID_CONFLICT", "任务 ID 已被其他用户使用，请重新提交。");
        }

        if (!input.imageJobExists && existing.status !== "reserved") {
          throw new AppError(409, "JOB_ID_EXPIRED", "任务已过期，请重新提交。");
        }

        return { charge: existing, created: false } as const;
      }

      const ledger = this.addCredits({
        userId: input.userId,
        delta: -input.cost,
        type: "generation_debit",
        referenceType: "image_job",
        referenceId: input.jobId,
        idempotencyKey: `generation_debit:${input.userId}:${input.jobId}`,
        memo: "图片生成预扣额度",
        createdBy: null,
      });
      const now = nowIso();

      this.database.prepare(`
        INSERT INTO generation_charges (job_id, user_id, cost, status, debit_ledger_id, refund_ledger_id, created_at, updated_at)
        VALUES (@jobId, @userId, @cost, 'reserved', @debitLedgerId, NULL, @now, @now)
      `).run({
        jobId: input.jobId,
        userId: input.userId,
        cost: input.cost,
        debitLedgerId: ledger.id,
        now,
      });

      return { charge: this.getGenerationCharge(input.jobId), created: true } as const;
    })();
  }

  finalizeGenerationCharge(jobId: string) {
    const now = nowIso();
    this.database.prepare(`
      UPDATE generation_charges SET status = 'charged', updated_at = @now
      WHERE job_id = @jobId AND status = 'reserved'
    `).run({ jobId, now });
  }

  refundGenerationCharge(jobId: string, memo: string) {
    return this.database.transaction(() => {
      const charge = this.getGenerationCharge(jobId);

      if (!charge || charge.status === "refunded") {
        return;
      }

      const ledger = this.addCredits({
        userId: charge.user_id,
        delta: charge.cost,
        type: "generation_refund",
        referenceType: "image_job",
        referenceId: jobId,
        idempotencyKey: `generation_refund:${charge.user_id}:${jobId}`,
        memo,
        createdBy: null,
      });
      const now = nowIso();
      this.database.prepare(`
        UPDATE generation_charges SET status = 'refunded', refund_ledger_id = @ledgerId, updated_at = @now
        WHERE job_id = @jobId
      `).run({ jobId, ledgerId: ledger.id, now });
    })();
  }

  getGenerationCharge(jobId: string) {
    return this.database
      .prepare("SELECT * FROM generation_charges WHERE job_id = ?")
      .get(jobId) as GenerationChargeRow | undefined;
  }

  getAccountSummary(userId: string): AccountSummaryResponse {
    const user = this.getUserById(userId);

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "用户不存在。");
    }

    return {
      user: toCurrentUser(user),
      balance: this.getBalance(userId),
      ledgerEntries: this.listLedgerEntries(userId, 20),
      orders: this.listOrders(userId, 10),
    };
  }

  listLedgerEntries(userId: string, limit: number) {
    return (this.database
      .prepare("SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, limit) as LedgerRow[]).map(toLedgerEntry);
  }

  searchUsers(query: string, limit: number) {
    const normalizedQuery = `%${normalizeEmail(query)}%`;
    return (this.database.prepare(`
      SELECT users.id, users.email, users.role, users.status, credit_accounts.balance, users.created_at, users.last_login_at
      FROM users
      JOIN credit_accounts ON credit_accounts.user_id = users.id
      WHERE users.email LIKE @query
      ORDER BY users.created_at DESC
      LIMIT @limit
    `).all({ query: normalizedQuery, limit }) as AdminUserRow[]).map(toAdminUserSummary);
  }

  createActivationCode(input: Readonly<{
    codeHash: string;
    credits: number;
    maxRedemptions: number;
    expiresAt?: string;
    createdBy: string;
  }>) {
    const id = createId("code");
    const now = nowIso();
    this.database.prepare(`
      INSERT INTO activation_codes (
        id, code_hash, credits, max_redemptions, redeemed_count, expires_at, disabled_at, created_by, created_at
      ) VALUES (
        @id, @codeHash, @credits, @maxRedemptions, 0, @expiresAt, NULL, @createdBy, @now
      )
    `).run({
      id,
      codeHash: input.codeHash,
      credits: input.credits,
      maxRedemptions: input.maxRedemptions,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy,
      now,
    });

    return this.getActivationCodeById(id);
  }

  getActivationCodeById(id: string) {
    const row = this.database.prepare(`
      SELECT id, credits, max_redemptions, redeemed_count, expires_at, disabled_at, created_at
      FROM activation_codes WHERE id = ?
    `).get(id) as ActivationCodeRow | undefined;

    return row ? toActivationCodeSummary(row) : undefined;
  }

  listActivationCodes(limit: number) {
    return (this.database.prepare(`
      SELECT id, credits, max_redemptions, redeemed_count, expires_at, disabled_at, created_at
      FROM activation_codes ORDER BY created_at DESC LIMIT ?
    `).all(limit) as ActivationCodeRow[]).map(toActivationCodeSummary);
  }

  redeemActivationCode(input: Readonly<{ codeHash: string; userId: string }>) {
    return this.database.transaction(() => {
      const code = this.database.prepare("SELECT * FROM activation_codes WHERE code_hash = ?").get(input.codeHash) as (
        ActivationCodeRow & { code_hash: string }
      ) | undefined;

      if (!code || code.disabled_at) {
        throw new AppError(404, "ACTIVATION_CODE_NOT_FOUND", "激活码无效或已停用。");
      }

      if (code.expires_at && code.expires_at < nowIso()) {
        throw new AppError(410, "ACTIVATION_CODE_EXPIRED", "激活码已过期。");
      }

      if (code.redeemed_count >= code.max_redemptions) {
        throw new AppError(409, "ACTIVATION_CODE_EXHAUSTED", "激活码已被使用完。");
      }

      const existing = this.database.prepare(`
        SELECT id FROM activation_redemptions WHERE code_id = ? AND user_id = ?
      `).get(code.id, input.userId);

      if (existing) {
        throw new AppError(409, "ACTIVATION_CODE_ALREADY_REDEEMED", "你已经兑换过这个激活码。");
      }

      const ledger = this.addCredits({
        userId: input.userId,
        delta: code.credits,
        type: "activation_credit",
        referenceType: "activation_code",
        referenceId: code.id,
        idempotencyKey: `activation:${code.id}:${input.userId}`,
        memo: "激活码充值",
        createdBy: null,
      });
      const now = nowIso();

      this.database.prepare("UPDATE activation_codes SET redeemed_count = redeemed_count + 1 WHERE id = ?").run(code.id);
      this.database.prepare(`
        INSERT INTO activation_redemptions (id, code_id, user_id, ledger_id, created_at)
        VALUES (@id, @codeId, @userId, @ledgerId, @now)
      `).run({ id: createId("redeem"), codeId: code.id, userId: input.userId, ledgerId: ledger.id, now });

      return { balance: this.getBalance(input.userId), creditsAdded: code.credits } as const;
    })();
  }

  createOrder(input: CreateOrderInput) {
    const now = nowIso();
    this.database.prepare(`
      INSERT INTO orders (
        id, user_id, provider, provider_order_id, status, pack_id, amount_cents, currency,
        credits, checkout_url, created_at, paid_at, expires_at
      ) VALUES (
        @id, @userId, @provider, @providerOrderId, 'pending', @packId, @amountCents, @currency,
        @credits, @checkoutUrl, @now, NULL, @expiresAt
      )
    `).run({
      id: input.id,
      userId: input.userId,
      provider: input.provider,
      providerOrderId: input.providerOrderId ?? null,
      packId: input.pack.id,
      amountCents: input.pack.amountCents,
      currency: input.pack.currency,
      credits: input.pack.credits,
      checkoutUrl: input.checkoutUrl,
      now,
      expiresAt: input.expiresAt,
    });

    const order = this.getOrderById(input.id, input.userId);

    if (!order) {
      throw new AppError(500, "ORDER_CREATE_FAILED", "创建订单失败，请稍后重试。");
    }

    return order;
  }

  getOrderById(orderId: string, userId?: string) {
    const row = userId
      ? this.database.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").get(orderId, userId)
      : this.database.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);

    return row ? toOrderSummary(row as OrderRow) : undefined;
  }

  getOrderByProviderOrderId(provider: PaymentProvider, providerOrderId: string) {
    const row = this.database
      .prepare("SELECT * FROM orders WHERE provider = ? AND provider_order_id = ?")
      .get(provider, providerOrderId) as OrderRow | undefined;

    return row ? toOrderSummary(row) : undefined;
  }

  listOrders(userId: string, limit: number) {
    return (this.database
      .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, limit) as OrderRow[]).map(toOrderSummary);
  }

  settlePaidOrder(input: Readonly<{
    provider: PaymentProvider;
    providerOrderId: string;
    amountCents: number;
    currency: string;
    event: PaymentEventInput;
  }>) {
    return this.database.transaction(() => {
      const existingEvent = this.database.prepare(`
        SELECT id FROM payment_events WHERE provider = ? AND provider_event_id = ?
      `).get(input.event.provider, input.event.providerEventId);

      if (existingEvent) {
        return { processed: false } as const;
      }

      const receivedAt = nowIso();
      this.database.prepare(`
        INSERT INTO payment_events (
          id, provider, provider_event_id, event_type, status, payload_json, received_at, processed_at, error_message
        ) VALUES (
          @id, @provider, @providerEventId, @eventType, 'processed', @payloadJson, @receivedAt, @receivedAt, NULL
        )
      `).run({
        id: input.event.id,
        provider: input.event.provider,
        providerEventId: input.event.providerEventId,
        eventType: input.event.eventType,
        payloadJson: input.event.payloadJson,
        receivedAt,
      });

      const order = this.getOrderByProviderOrderId(input.provider, input.providerOrderId);

      if (!order) {
        throw new AppError(404, "ORDER_NOT_FOUND", "订单不存在。");
      }

      if (order.amountCents !== input.amountCents || order.currency !== input.currency) {
        throw new AppError(400, "PAYMENT_AMOUNT_MISMATCH", "支付金额或币种不匹配。");
      }

      if (order.status === "paid") {
        return { processed: false } as const;
      }

      if (order.status !== "pending") {
        throw new AppError(409, "ORDER_NOT_PAYABLE", "订单当前状态不能入账。");
      }

      this.addCredits({
        userId: order.userId,
        delta: order.credits,
        type: "payment_credit",
        referenceType: "order",
        referenceId: order.id,
        idempotencyKey: `payment:${order.provider}:${order.providerOrderId}`,
        memo: "支付充值",
        createdBy: null,
      });

      this.database.prepare("UPDATE orders SET status = 'paid', paid_at = @now WHERE id = @orderId")
        .run({ orderId: order.id, now: receivedAt });

      return { processed: true } as const;
    })();
  }

  private initializeSchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS credit_accounts (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS credit_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        type TEXT NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        idempotency_key TEXT UNIQUE,
        memo TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS generation_charges (
        job_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cost INTEGER NOT NULL,
        status TEXT NOT NULL,
        debit_ledger_id TEXT NOT NULL,
        refund_ledger_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, job_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS activation_codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        credits INTEGER NOT NULL CHECK (credits > 0),
        max_redemptions INTEGER NOT NULL DEFAULT 1,
        redeemed_count INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        disabled_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS activation_redemptions (
        id TEXT PRIMARY KEY,
        code_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        ledger_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(code_id, user_id),
        FOREIGN KEY (code_id) REFERENCES activation_codes(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (ledger_id) REFERENCES credit_ledger(id)
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_order_id TEXT UNIQUE,
        status TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        credits INTEGER NOT NULL,
        checkout_url TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        expires_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS payment_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        processed_at TEXT,
        error_message TEXT,
        UNIQUE(provider, provider_event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created_at ON credit_ledger(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_user_created_at ON orders(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_provider_order_id ON orders(provider, provider_order_id);
    `);
  }
}

const storeCache = new Map<string, AppStore>();

export const getAppStore = (databasePath: string) => {
  const cachedStore = storeCache.get(databasePath);

  if (cachedStore) {
    return cachedStore;
  }

  const store = new AppStore(databasePath);
  storeCache.set(databasePath, store);
  return store;
};

export const resetAppStoreCache = () => {
  for (const store of storeCache.values()) {
    store.close();
  }

  storeCache.clear();
};
