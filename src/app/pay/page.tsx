import { PayPanel } from "@/components/PayPanel";

export const dynamic = "force-dynamic";

export default function PayPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <PayPanel />
      </section>
    </main>
  );
}
