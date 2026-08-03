import { Link } from "react-router-dom";
import { DashboardLayout } from "../components/DashboardLayout";
import { JoinMeetingIcon, ScheduleIcon, StartMeetingIcon } from "../components/DashboardIcons";
import { MiniCalendar } from "../components/MiniCalendar";
import { getGreeting, getInitials, useAuth } from "../hooks/useAuth";

export function DashboardPage() {
  const { user } = useAuth();
  const displayName = user?.displayName ?? "Guest";
  const greeting = getGreeting();

  return (
    <DashboardLayout>
      <div className="dashboard-grid">
        <section className="dashboard-welcome widget-card">
          <h1 className="dashboard-greeting">
            {greeting}, {displayName}!
          </h1>
          <div className="dashboard-welcome-avatar" aria-hidden="true">
            {getInitials(displayName)}
          </div>
        </section>

        <section className="dashboard-actions">
          <Link to="/create" className="action-card">
            <StartMeetingIcon />
            <span>Start a meeting</span>
          </Link>
          <Link to="/join" className="action-card">
            <JoinMeetingIcon />
            <span>Join a meeting</span>
          </Link>
          <Link to="/create" className="action-card">
            <ScheduleIcon />
            <span>Schedule a meeting</span>
          </Link>
        </section>

        <section className="dashboard-agenda widget-card">
          <h2 className="widget-title">Your agenda today</h2>
          <div className="agenda-empty">
            <p>No meetings on your calendar yet.</p>
            <Link to="/create" className="btn btn-primary btn-sm">
              Start your first meeting
            </Link>
          </div>
        </section>

        <div className="dashboard-bottom-row">
          <section className="widget-card">
            <MiniCalendar />
          </section>

          <section className="widget-card">
            <h2 className="widget-title">Invitations</h2>
            <div className="invitations-empty">
              <p>No pending invitations</p>
            </div>
          </section>

          <section className="widget-card insights-card">
            <h2 className="widget-title">Insights</h2>
            <div className="insights-stats">
              <div className="insight-stat">
                <span className="insight-value">—</span>
                <span className="insight-label">Meetings you hosted this week</span>
              </div>
              <div className="insight-stat">
                <span className="insight-value">—</span>
                <span className="insight-label">Meetings you joined this week</span>
              </div>
            </div>
            <p className="insights-note muted">
              LiveKit-powered rooms with real-time chat and host controls.
            </p>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
