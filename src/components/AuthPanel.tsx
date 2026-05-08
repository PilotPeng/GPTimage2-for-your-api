"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/client/imageApi";
import { getRoutePath } from "@/lib/client/routePaths";
import { ErrorMessage } from "./ErrorMessage";

type AuthPanelProps = Readonly<{
  mode?: "login" | "register";
}>;

export function AuthPanel({ mode = "login" }: AuthPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (isRegister && password !== confirmPassword) {
        setError("两次输入的密码不一致。");
        setIsSubmitting(false);
        return;
      }

      if (isRegister) {
        await register({ email, password });
      } else {
        await login({ email, password });
      }

      router.push(getRoutePath("/account"));
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : isRegister ? "注册失败，请稍后重试。" : "登录失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="generator-card narrow-card" onSubmit={handleSubmit}>
      <div className="section-heading">
        <h2>{isRegister ? "注册账户" : "登录账户"}</h2>
        <span>{isRegister ? "注册后自动登录，可查看额度并开始创作。" : "登录后查看额度并开始创作。"}</span>
      </div>
      <div className="field-group">
        <label htmlFor="email">邮箱</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </div>
      <div className="field-group">
        <label htmlFor="password">密码</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} minLength={isRegister ? 8 : undefined} required />
      </div>
      {isRegister ? (
        <div className="field-group">
          <label htmlFor="confirmPassword">确认密码</label>
          <input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
      ) : null}
      <ErrorMessage message={error} />
      <div className="button-row">
        <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? isRegister ? "注册中..." : "登录中..." : isRegister ? "注册" : "登录"}</button>
      </div>
      <p className="field-help">
        {isRegister ? "已有账户？" : "还没有账户？"} <Link className="text-link" href={getRoutePath(isRegister ? "/login" : "/register")}>{isRegister ? "去登录" : "去注册"}</Link>
      </p>
    </form>
  );
}
