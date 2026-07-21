import { Link } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";

export function HomePage() {
  return (
    <div className="page landing">
      <header className="landing-hero">
        <BrandLogo size={48} />
        <h1>Go live. Stay connected.</h1>
        <p className="subtitle">
          Project-K multiparty video on LiveKit — adaptive streams, real-time chat, and host
          controls built for webinar-scale rooms.
        </p>
        <div className="landing-actions">
          <Link className="btn btn-primary" to="/create">
            Start a meeting
          </Link>
          <Link className="btn btn-secondary" to="/join">
            Join with code
          </Link>
        </div>
      </header>
      <section className="card-grid">
        <article className="card">
          <h2>Live presence</h2>
          <p>
            A red LIVE badge and viewer count sit in the header — see who is in the room at a
            glance, YouTube-live style.
          </p>
        </article>
        <article className="card">
          <h2>Chat &amp; people together</h2>
          <p>
            One sidebar for messages and the participant list. Hosts can lock the room or remove
            people without leaving the conversation.
          </p>
        </article>
      </section>
    </div>
  );
}
