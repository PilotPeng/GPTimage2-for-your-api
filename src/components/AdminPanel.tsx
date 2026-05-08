"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { adjustUserCredits, createActivationCode, fetchActivationCodes, fetchAdminUsers } from "@/lib/client/imageApi";
import type { ActivationCodeSummary, AdminUserSummary } from "@/lib/shared/types";
import { ErrorMessage } from "./ErrorMessage";

export function AdminPanel() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<readonly AdminUserSummary[]>([]);
  const [codes, setCodes] = useState<readonly ActivationCodeSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [delta, setDelta] = useState("10");
  const [memo, setMemo] = useState("");
  const [codeCredits, setCodeCredits] = useState("10");
  const [newCode, setNewCode] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (searchQuery = query) => {
    const [userResponse, codeResponse] = await Promise.all([fetchAdminUsers(searchQuery), fetchActivationCodes()]);
    setUsers(userResponse.users);
    setCodes(codeResponse.activationCodes);
  }, [query]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchAdminUsers(""), fetchActivationCodes()])
      .then(([userResponse, codeResponse]) => {
        if (isMounted) {
          setUsers(userResponse.users);
          setCodes(codeResponse.activationCodes);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "读取后台数据失败。");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    await load(query).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "查询失败。"));
  };

  const handleAdjust = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      await adjustUserCredits(selectedUserId, { delta: Number.parseInt(delta, 10), memo });
      await load();
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "调整额度失败。");
    }
  };

  const handleCreateCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNewCode("");

    try {
      const response = await createActivationCode({ credits: Number.parseInt(codeCredits, 10) });
      setNewCode(response.code);
      await load();
    } catch (codeError) {
      setError(codeError instanceof Error ? codeError.message : "创建激活码失败。");
    }
  };

  return (
    <section className="generator-card admin-grid">
      <div className="section-heading">
        <h2>管理后台</h2>
        <span>手动调整额度和生成激活码。</span>
      </div>
      <ErrorMessage message={error} />
      <form className="settings-row" onSubmit={handleSearch}>
        <div className="field-group">
          <label htmlFor="userQuery">用户邮箱</label>
          <input id="userQuery" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户" />
        </div>
        <button className="secondary-button" type="submit">查询</button>
      </form>
      <div className="history-list">
        {users.map((user) => (
          <button type="button" className="history-item" key={user.id} onClick={() => setSelectedUserId(user.id)}>
            <span>
              <strong>{user.email}</strong>
              <small>{user.role} · {user.balance} 点</small>
            </span>
          </button>
        ))}
      </div>
      <form className="settings-row" onSubmit={handleAdjust}>
        <div className="field-group">
          <label htmlFor="delta">额度调整</label>
          <input id="delta" value={delta} onChange={(event) => setDelta(event.target.value)} />
        </div>
        <div className="field-group">
          <label htmlFor="memo">备注</label>
          <input id="memo" value={memo} onChange={(event) => setMemo(event.target.value)} />
        </div>
        <button className="primary-button" type="submit" disabled={!selectedUserId}>调整</button>
      </form>
      <form className="settings-row" onSubmit={handleCreateCode}>
        <div className="field-group">
          <label htmlFor="codeCredits">激活码额度</label>
          <input id="codeCredits" value={codeCredits} onChange={(event) => setCodeCredits(event.target.value)} />
        </div>
        <button className="primary-button" type="submit">生成激活码</button>
      </form>
      {newCode ? <p className="inline-status">新激活码：{newCode}</p> : null}
      <div className="history-list">
        {codes.map((code) => (
          <div className="history-item ledger-item" key={code.id}>
            <span>
              <strong>{code.credits} 点 · {code.redeemedCount}/{code.maxRedemptions}</strong>
              <small>{new Date(code.createdAt).toLocaleString("zh-CN")}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
