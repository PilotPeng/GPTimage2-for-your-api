import { AuthPanel } from "@/components/AuthPanel";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <AuthPanel mode="register" />
      </section>
    </main>
  );
}
