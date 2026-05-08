import { AuthPanel } from "@/components/AuthPanel";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <AuthPanel />
      </section>
    </main>
  );
}
