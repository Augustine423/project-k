import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="page landing">
      <header className="landing-hero">
        <p className="eyebrow">Project K</p>
        <h1>Symmetrical video meetings on LiveKit</h1>
        <p className="subtitle">
          KZYS Phase A — Join Never Fails. Multiparty SFU with TURN fallback, adaptive bitrate,
          and audio-first join on constrained networks.
        </p>
        <div className="landing-actions">
          <Link className="btn btn-primary" to="/create">
            Create meeting
          </Link>
          <Link className="btn btn-secondary" to="/join">
            Join meeting
          </Link>
        </div>
      </header>
      <section className="card-grid">
        <article className="card">
          <h2>Multiparty SFU</h2>
          <p>Up to 10 participants per room for current testing — camera, mic, and screen share.</p>
        </article>
        <article className="card">
          <h2>Host controls</h2>
          <p>Lock the room, remove participants, end the meeting, and chat over WebSocket.</p>
        </article>
      </section>
    </div>
  );
}
