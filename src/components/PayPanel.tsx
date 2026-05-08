"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOrder, fetchOrders } from "@/lib/client/imageApi";
import type { ManualPaymentConfig, PaymentOrderSummary, PaymentPack } from "@/lib/shared/types";
import { ErrorMessage } from "./ErrorMessage";

type OrdersState = Readonly<{
  packs: readonly PaymentPack[];
  orders: readonly PaymentOrderSummary[];
  manualPayment: ManualPaymentConfig;
}>;

const emptyManualPayment: ManualPaymentConfig = {
  enabled: false,
  qrImageUrl: "",
  title: "",
  description: "",
};

const formatMoney = (amountCents: number, currency: string) => `${(amountCents / 100).toFixed(2)} ${currency}`;
const getApproxImageCount = (credits: number) => Math.floor(credits);

export function PayPanel() {
  const router = useRouter();
  const [state, setState] = useState<OrdersState>({ packs: [], orders: [], manualPayment: emptyManualPayment });
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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
          setError(loadError instanceof Error ? loadError.message : "读取充值套餐失败。");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateOrder = async (packId: string) => {
    setError("");
    setIsCreating(true);

    try {
      const response = await createOrder({ packId });
      router.push(response.checkoutUrl);
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "创建订单失败，请稍后重试。");
      setIsCreating(false);
    }
  };

  return (
    <section className="generator-card">
      <div className="section-heading">
        <h2>充值额度</h2>
        <span>当前接入支付宝网页支付，到账以支付通知为准。</span>
      </div>
      <ErrorMessage message={error} />
      {state.manualPayment.enabled ? (
        <article className="manual-payment-card">
          <div>
            <h3>{state.manualPayment.title}</h3>
            <p>{state.manualPayment.description}</p>
          </div>
          <img src={state.manualPayment.qrImageUrl} alt="管理员收款二维码" />
        </article>
      ) : null}
      <div className="pack-grid">
        {state.packs.map((pack) => (
          <article className="feature-pill pack-card" key={pack.id}>
            <span>{pack.title ?? `${pack.credits} 点额度`}</span>
            <strong>{formatMoney(pack.amountCents, pack.currency)}</strong>
            <p className="field-help">{pack.credits} 点额度，约可生成 {getApproxImageCount(pack.credits)} 张图片</p>
            {pack.description ? <p className="field-help">{pack.description}</p> : null}
            <button className="primary-button" type="button" disabled={isCreating} onClick={() => handleCreateOrder(pack.id)}>
              {isCreating ? "创建中..." : "立即充值"}
            </button>
          </article>
        ))}
      </div>
      {state.packs.length === 0 ? <p className="field-help">服务器还没有配置充值套餐。</p> : null}
    </section>
  );
}
