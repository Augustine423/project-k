import { Link, useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import {
  CalendarIcon,
  ContactsIcon,
  HomeIcon,
  LogOutIcon,
  RecordingIcon,
  WhiteboardIcon,
} from "./DashboardIcons";
import { getInitials, useAuth } from "../hooks/useAuth";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: string;
  label: string;
  to: string;
  icon: typeof HomeIcon;
  disabled?: boolean;
}> = [
  { id: "home", label: "Home", to: "/dashboard", icon: HomeIcon },
  { id: "calendar", label: "Calendar", to: "/dashboard#calendar", icon: CalendarIcon, disabled: true },
  { id: "recording", label: "Recording", to: "#", icon: RecordingIcon, disabled: true },
  { id: "contacts", label: "Contacts", to: "#", icon: ContactsIcon, disabled: true },
  { id: "whiteboards", label: "Whiteboards", to: "#", icon: WhiteboardIcon, disabled: true },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const displayName = user?.displayName ?? "Guest";
  const isDashboard = location.pathname === "/dashboard";

  function onLogout() {
    signOut();
    navigate("/login");
  }

  return (
    <div className="dashboard-app">
      <header className="dashboard-header">
        <Link to="/dashboard" className="dashboard-header-brand">
          <BrandLogo size={32} variant="light" />
        </Link>
        <div className="dashboard-header-profile">
          <span className="dashboard-header-name">{displayName}</span>
          <div className="dashboard-avatar" aria-hidden="true">
            {getInitials(displayName)}
          </div>
        </div>
      </header>

      <div className="dashboard-body">
        <aside className="dashboard-sidebar">
          <nav className="dashboard-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(({ id, label, to, icon: NavIcon, disabled }) => {
              const active = !disabled && isDashboard && id === "home";
              if (disabled) {
                return (
                  <span key={id} className="dashboard-nav-item is-disabled" title="Coming soon">
                    <NavIcon size={20} />
                    <span>{label}</span>
                  </span>
                );
              }
              return (
                <Link
                  key={id}
                  to={to}
                  className={`dashboard-nav-item${active ? " is-active" : ""}`}
                >
                  <NavIcon size={20} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <button type="button" className="dashboard-nav-item dashboard-logout" onClick={onLogout}>
            <LogOutIcon size={20} />
            <span>Log out</span>
          </button>
        </aside>

        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
