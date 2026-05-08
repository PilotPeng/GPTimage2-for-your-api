"use client";

import Link from "next/link";
import { getRoutePath } from "@/lib/client/routePaths";

export function AppNav() {
  return (
    <nav className="app-nav" aria-label="主导航">
      <Link href={getRoutePath("/")}>创作</Link>
      <Link href={getRoutePath("/account")}>账户</Link>
      <Link href={getRoutePath("/register")}>注册</Link>
      <Link href={getRoutePath("/pay")}>充值</Link>
      <Link href={getRoutePath("/orders")}>订单</Link>
    </nav>
  );
}
