import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";

export function HomePage() {
  return (
    <div className="page landing">
      <header className="landing-hero">
        <BrandLogo size={48} />
        <h1>Video meetings that just work</h1>
        <p className="subtitle">
          Project-K multiparty SFU on LiveKit — WebRTC video with adaptive streaming. Deployed on
          Kubernetes for webinar-scale rooms (up to 10,000 joins). Chat and room control use the
          project backend (not the SFU).
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
          <p>
            LiveKit publishes ~720p with adaptive layers so viewers get the best
            quality their connection can handle. Chat and participants
            use the project WebSocket backend.
          </p>
        </article>
        <article className="card">
          <h2>Host controls</h2>
          <p>Lock the room, remove participants, end the meeting, and chat in real time.</p>
        </article>
      </section>
    </div>
  );
}
