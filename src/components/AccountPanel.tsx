"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAccount, logout, redeemActivationCode } from "@/lib/client/imageApi";
import { getRoutePath } from "@/lib/client/routePaths";
import type { AccountSummaryResponse } from "@/lib/shared/types";
import { ErrorMessage } from "./ErrorMessage";

const formatDelta = (delta: number) => delta > 0 ? `+${delta}` : `${delta}`;

export function AccountPanel() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountSummaryResponse>();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    const nextAccount = await fetchAccount();
    setAccount(nextAccount);
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchAccount()
      .then((nextAccount) => {
        if (isMounted) {
          setAccount(nextAccount);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "读取账户失败。");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const response = await redeemActivationCode({ code });
      setMessage(`兑换成功，增加 ${response.creditsAdded} 点额度。`);
      setCode("");
      await loadAccount();
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : "兑换失败，请稍后重试。");
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push(getRoutePath("/login"));
  };

  if (!account) {
    return (
      <section className="generator-card narrow-card">
        <ErrorMessage message={error} />
        {!error ? <p className="field-help">正在读取账户...</p> : null}
      </section>
    );
  }

  return (
    <section className="generator-card account-grid">
      <div className="section-heading">
        <h2>账户中心</h2>
        <span>{account.user.email}</span>
      </div>
      <div className="balance-card">
        <span>当前余额</span>
        <strong>{account.balance} 点</strong>
      </div>
      <div className="button-row">
        <Link className="primary-button link-button" href={getRoutePath("/pay")}>去充值</Link>
        <Link className="secondary-button link-button" href={getRoutePath("/orders")}>订单记录</Link>
        <button className="secondary-button" type="button" onClick={handleLogout}>退出登录</button>
      </div>
      <form className="redeem-card" onSubmit={handleRedeem}>
        <div className="field-group">
          <label htmlFor="activationCode">激活码</label>
          <input id="activationCode" value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入激活码" />
        </div>
        <button className="secondary-button" type="submit">兑换</button>
      </form>
      {message ? <p className="inline-status">{message}</p> : null}
      <ErrorMessage message={error} />
      <div className="history-panel">
        <div className="history-heading">
          <div>
            <h3>最近额度流水</h3>
            <span>扣费、退款、充值都会记录在这里。</span>
          </div>
        </div>
        <div className="history-list">
          {account.ledgerEntries.map((entry) => (
            <div className="history-item ledger-item" key={entry.id}>
              <span>
                <strong>{formatDelta(entry.delta)} 点 · {entry.type}</strong>
                <small>{entry.memo ?? "无备注"} · {new Date(entry.createdAt).toLocaleString("zh-CN")}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
