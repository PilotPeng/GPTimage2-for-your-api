import { AccountPanel } from "@/components/AccountPanel";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <AccountPanel />
      </section>
    </main>
  );
}
