import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <AdminPanel />
      </section>
    </main>
  );
}
