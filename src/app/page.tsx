export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Daisy Chain Mail</h1>
      <p>Subscriber sync service (Bandcamp, Laylo → Beehiiv).</p>
      <p>
        <code>GET /api/cron/bandcamp</code> — scheduled poll (Bearer{" "}
        <code>CRON_SECRET</code>)
      </p>
    </main>
  );
}
