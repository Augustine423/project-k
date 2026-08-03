import { useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { AuthView } from "../components/auth/authValidation";
import { AuthHero } from "../components/auth/AuthShared";
import {
  ForgotPasswordRequestForm,
  ForgotPasswordResetForm,
} from "../components/auth/ForgotPasswordForm";
import { SignInForm } from "../components/auth/SignInForm";
import { SignUpForm } from "../components/auth/SignUpForm";
import { UsernameSetupForm } from "../components/auth/UsernameSetupForm";
import { useAuth } from "../hooks/useAuth";

function parseInitialView(searchParams: URLSearchParams, pathname: string): AuthView {
  if (pathname === "/signup") return "signup";
  const mode = searchParams.get("mode");
  if (mode === "signup") return "signup";
  if (mode === "forgot") return "forgot-request";
  return "signin";
}

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { isAuthenticated, needsUsername, ready } = useAuth();
  const [view, setView] = useState<AuthView>(() =>
    parseInitialView(searchParams, location.pathname),
  );
  const [resetEmail, setResetEmail] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [socialNotice, setSocialNotice] = useState("");

  function goAfterAuth(needsUsernameSetup: boolean) {
    if (needsUsernameSetup) {
      // Stay on /login so AuthPage can render UsernameSetupForm.
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  function onSocial(provider: "google" | "slack") {
    setSocialNotice(
      `${provider === "google" ? "Google" : "Slack"} sign-in is coming soon. Use email instead.`,
    );
  }

  function switchView(next: AuthView) {
    setSocialNotice("");
    if (next !== "signin") setSignupDone(false);
    setView(next);
  }

  if (!ready) {
    return (
      <div className="auth-page">
        <main className="auth-panel">
          <div className="auth-shell">
            <p className="auth-subtitle" style={{ textAlign: "center" }}>
              Loading…
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (isAuthenticated && needsUsername) {
    return (
      <div className="auth-page">
        <div className="auth-ambient" aria-hidden="true">
          <span className="auth-blob auth-blob--a" />
          <span className="auth-blob auth-blob--b" />
          <span className="auth-grid" />
        </div>
        <main className="auth-panel">
          <div className="auth-shell">
            <div className="auth-view-stage">
              <UsernameSetupForm onSuccess={() => navigate("/dashboard", { replace: true })} />
            </div>
          </div>
        </main>
        <AuthHero />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="auth-page">
      <div className="auth-ambient" aria-hidden="true">
        <span className="auth-blob auth-blob--a" />
        <span className="auth-blob auth-blob--b" />
        <span className="auth-grid" />
      </div>

      <main className="auth-panel">
        <div className="auth-shell">
          {socialNotice && <p className="auth-banner auth-banner--info">{socialNotice}</p>}

          {signupDone && view === "signin" && (
            <p className="auth-banner auth-banner--success">
              Signup successful. Please login with your email and password.
            </p>
          )}

          {resetDone && view === "signin" && (
            <p className="auth-banner auth-banner--success">
              Password updated. Sign in with your new password.
            </p>
          )}

          <div key={view} className="auth-view-stage">
            {view === "signin" && (
              <SignInForm
                onSwitchSignUp={() => switchView("signup")}
                onForgotPassword={() => {
                  setResetDone(false);
                  setSignupDone(false);
                  switchView("forgot-request");
                }}
                onSuccess={goAfterAuth}
                onSocial={onSocial}
              />
            )}

            {view === "signup" && (
              <SignUpForm
                onSwitchSignIn={() => switchView("signin")}
                onSuccess={() => {
                  setSignupDone(true);
                  setResetDone(false);
                  setView("signin");
                  navigate("/login", { replace: true });
                }}
                onSocial={onSocial}
              />
            )}

            {view === "forgot-request" && (
              <ForgotPasswordRequestForm
                onContinue={(email) => {
                  setResetEmail(email);
                  setView("forgot-reset");
                }}
                onBackToSignIn={() => switchView("signin")}
              />
            )}

            {view === "forgot-reset" && (
              <ForgotPasswordResetForm
                email={resetEmail}
                onBackToSignIn={() => switchView("signin")}
                onResetComplete={() => {
                  setResetDone(true);
                  setView("signin");
                }}
              />
            )}
          </div>
        </div>
      </main>

      <AuthHero />
    </div>
  );
}
