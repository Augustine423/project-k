import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="page landing">
      <header className="landing-hero">
        <p className="eyebrow">Project K</p>
        <h1>Video meetings built on Janus</h1>
        <p className="subtitle">
          Create an interactive room or join a webinar. Local dev stack: Go control plane, Janus SFU, Redis, coturn.
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
          <h2>Interactive</h2>
          <p>Everyone can publish camera and microphone in a VideoRoom.</p>
        </article>
        <article className="card">
          <h2>Webinar</h2>
          <p>Hosts publish on stage; viewers watch via the Streaming plugin.</p>
        </article>
      </section>
    </div>
  );
}
