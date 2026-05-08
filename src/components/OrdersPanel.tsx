"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchOrders } from "@/lib/client/imageApi";
import type { PaymentOrderSummary, PaymentPack } from "@/lib/shared/types";
import { ErrorMessage } from "./ErrorMessage";

type OrdersState = Readonly<{
  packs: readonly PaymentPack[];
  orders: readonly PaymentOrderSummary[];
}>;

const statusLabels = {
  pending: "待支付",
  paid: "已支付",
  expired: "已过期",
  cancelled: "已取消",
  refunded: "已退款",
} as const;

export function OrdersPanel() {
  const [state, setState] = useState<OrdersState>({ packs: [], orders: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    fetchOrders()
      .then((nextState) => {
        if (isMounted) {
          setState(nextState);
        }
      })
      .catch((loadError) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "读取订单失败。");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="generator-card">
      <div className="section-heading">
        <h2>订单记录</h2>
        <span>支付成功后由支付宝通知自动入账。</span>
      </div>
      <ErrorMessage message={error} />
      <div className="history-list">
        {state.orders.map((order) => (
          <div className="history-item ledger-item" key={order.id}>
            <span>
              <strong>{order.credits} 点 · {statusLabels[order.status]}</strong>
              <small>{(order.amountCents / 100).toFixed(2)} {order.currency} · {new Date(order.createdAt).toLocaleString("zh-CN")}</small>
            </span>
            {order.status === "pending" && order.checkoutUrl ? <Link className="secondary-button link-button" href={order.checkoutUrl}>继续支付</Link> : null}
          </div>
        ))}
      </div>
      {state.orders.length === 0 ? <p className="field-help">暂无订单。</p> : null}
    </section>
  );
}
