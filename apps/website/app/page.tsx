import Image from "next/image";

export const dynamic = "force-static";

export default function FoundationPage() {
  return (
    <main className="foundation">
      <header className="brand-header">
        <Image
          src="/brand/wordmark-light.svg"
          alt="UniBOS"
          width={420}
          height={150}
          className="wordmark"
          unoptimized
          priority
        />
        <span className="phase-label">Engineering foundation</span>
      </header>

      <section className="introduction" aria-labelledby="foundation-title">
        <p className="eyebrow">Unified Business Operating System</p>
        <h1 id="foundation-title">
          One platform.
          <br />
          Your entire business.
        </h1>
        <p className="lead">
          The UniBOS engineering foundation is being built. This local page
          confirms the website application can run; business services are not
          available yet.
        </p>
      </section>

      <section className="status-grid" aria-label="Development scope">
        <article className="status-card">
          <span className="card-label">Current milestone</span>
          <h2>P1 · Engineering foundation</h2>
          <p>
            Establishing the application structure and development tools before
            implementing business workflows.
          </p>
        </article>
        <article className="status-card status-card-muted">
          <span className="card-label">Not available yet</span>
          <h2>Business operations</h2>
          <p>
            Accounts, menus, orders, payments and subscriptions are planned.
            This page does not create accounts or process transactions.
          </p>
        </article>
      </section>

      <footer>
        <span>Made in Uzbekistan. Built for the world.</span>
        <span>Local development · No live service</span>
      </footer>
    </main>
  );
}
