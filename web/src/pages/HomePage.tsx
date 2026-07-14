import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";

export function HomePage() {
  return (
    <div className="page landing">
      <header className="landing-hero">
        <BrandLogo size={48} />
        <h1>Video meetings that just work</h1>
        <p className="subtitle">
          Project-K multiparty SFU on Janus — lightweight WebRTC video meetings with TURN
          for mobile and constrained networks.
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
          <p>Up to 50 participants — auto-switches to webinar mode for large audiences.</p>
        </article>
        <article className="card">
          <h2>Host controls</h2>
          <p>Lock the room, remove participants, end the meeting, and chat in real time.</p>
        </article>
      </section>
    </div>
  );
}
