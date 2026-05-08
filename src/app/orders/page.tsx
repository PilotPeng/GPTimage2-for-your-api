import { OrdersPanel } from "@/components/OrdersPanel";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <OrdersPanel />
      </section>
    </main>
  );
}
