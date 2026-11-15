import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-static";

export default function WorkspaceDemoPage() {
  return (
    <main className="demo-page">
      <div className="demo-banner">
        DEMO PREVIEW · All figures and businesses on this page are fictional.
      </div>
      <header className="demo-topbar">
        <Link className="demo-topbrand" href="/">
          <Image
            src="/brand/mark-light.svg"
            alt=""
            width={25}
            height={29}
            unoptimized
          />{" "}
          UniBOS <span className="ui-badge">Demo</span>
        </Link>
        <nav className="demo-toplinks">
          <a href="#overview">Overview</a>
          <a href="#locations">Locations</a>
          <Link href="/demo/guest">Guest menu ›</Link>
          <Link href="/">Exit demo</Link>
        </nav>
      </header>
      <div className="demo-content" id="overview">
        <p
          className="ui-muted"
          style={{ fontSize: 10, letterSpacing: ".12em" }}
        >
          BUSINESS WORKSPACE / OVERVIEW
        </p>
        <h1>Good morning, Umida</h1>
        <p className="demo-subtitle">
          Here’s a sample snapshot across your locations.{" "}
          <span className="ui-badge">Illustrative data</span>
        </p>
        <section
          className="demo-stat-grid"
          aria-label="Sample business metrics"
        >
          <article className="demo-stat">
            <small>NET SALES · TODAY</small>
            <b>$2,480</b>
            <span>Sample · +8.2% vs. prior period</span>
          </article>
          <article className="demo-stat">
            <small>ORDERS · TODAY</small>
            <b>86</b>
            <span>Sample · +4.6% vs. prior period</span>
          </article>
          <article className="demo-stat">
            <small>ACTIVE LOCATIONS</small>
            <b>03</b>
            <span>Three demo locations</span>
          </article>
          <article className="demo-stat">
            <small>TEAM ON SHIFT</small>
            <b>12</b>
            <span>Sample team roster</span>
          </article>
        </section>
        <div className="demo-columns">
          <section className="ui-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <b style={{ fontSize: 13 }}>Location overview</b>
              <span className="ui-muted" style={{ fontSize: 9 }}>
                Sample · Today
              </span>
            </div>
            <table className="demo-table">
              <thead>
                <tr>
                  <th>LOCATION</th>
                  <th>ORDERS</th>
                  <th>NET SALES</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Green Table · Downtown</td>
                  <td>38</td>
                  <td>$1,140</td>
                  <td>
                    <span className="demo-status">Open</span>
                  </td>
                </tr>
                <tr>
                  <td>Green Table · Riverside</td>
                  <td>29</td>
                  <td>$860</td>
                  <td>
                    <span className="demo-status">Open</span>
                  </td>
                </tr>
                <tr>
                  <td>Green Table · Garden</td>
                  <td>19</td>
                  <td>$480</td>
                  <td>
                    <span className="demo-status">Open</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
          <section className="ui-card" id="locations">
            <b style={{ fontSize: 13 }}>Team activity</b>
            <p className="ui-muted" style={{ fontSize: 10, lineHeight: 1.7 }}>
              A simple overview of sample shifts. Staff scheduling is not
              connected in this demo.
            </p>
            <div className="branch-list">
              <div className="branch-row">
                <div>
                  Downtown team<small>4 people · sample</small>
                </div>
                <span className="demo-status">On shift</span>
              </div>
              <div className="branch-row">
                <div>
                  Riverside team<small>5 people · sample</small>
                </div>
                <span className="demo-status">On shift</span>
              </div>
              <div className="branch-row">
                <div>
                  Garden team<small>3 people · sample</small>
                </div>
                <span className="demo-status">On shift</span>
              </div>
            </div>
          </section>
        </div>
        <div
          className="ui-card"
          style={{
            marginTop: 14,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span className="ui-badge">Demo boundary</span>
          <span className="ui-muted" style={{ fontSize: 10 }}>
            This screen is a static product preview. It is not connected to an
            account or live business data.
          </span>
        </div>
      </div>
    </main>
  );
}
