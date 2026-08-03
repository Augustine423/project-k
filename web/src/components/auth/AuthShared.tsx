import { BrandLogo } from "../BrandLogo";
import { EyeIcon, EyeOffIcon, GoogleIcon, SlackIcon } from "./AuthIcons";

interface AuthSocialButtonsProps {
  onSocial?: (provider: "google" | "slack") => void;
}

export function AuthSocialButtons({ onSocial }: AuthSocialButtonsProps) {
  return (
    <div className="auth-social">
      <button type="button" className="auth-social-btn" onClick={() => onSocial?.("google")}>
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>
      <button type="button" className="auth-social-btn" onClick={() => onSocial?.("slack")}>
        <SlackIcon />
        <span>Continue with Slack</span>
      </button>
      <div className="auth-or" role="separator" aria-label="or">
        <span>or continue with email</span>
      </div>
    </div>
  );
}

export function AuthPasswordToggle({
  visible,
  onToggle,
  active,
}: {
  visible: boolean;
  onToggle: () => void;
  active: boolean;
}) {
  if (!active) return null;

  return (
    <button
      type="button"
      className="auth-password-toggle"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );
}

export function AuthHeader({ title, subtitle }: { title?: string; subtitle: string }) {
  return (
    <header className="auth-header">
      <div className="auth-brand-block">
        <BrandLogo size={44} className="auth-brand-logo" />
        <p className="auth-tagline">Meeting with all your team Max</p>
      </div>
      {title ? <h1 className="auth-title">{title}</h1> : null}
      <p className="auth-subtitle">{subtitle}</p>
    </header>
  );
}

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className={`auth-field${error ? " is-invalid" : ""}`} htmlFor={id}>
      <span className="auth-field-label">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error && (
        <span className="auth-field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="auth-field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function AuthHero() {
  return (
    <aside className="auth-hero" aria-hidden="true">
      <div className="auth-hero-frame">
        <picture>
          <source media="(min-width: 901px)" srcSet="/auth-hero.jpg 1x, /auth-hero@2x.jpg 2x" />
          <img
            className="auth-hero-img"
            src="/auth-hero.jpg"
            alt=""
            decoding="async"
            fetchPriority="high"
          />
        </picture>
        <div className="auth-hero-veil" />
        <div className="auth-hero-caption">
          <span className="auth-hero-kicker">Teams that ship</span>
          <p>Meet, decide, and move — without the clutter.</p>
        </div>
      </div>
    </aside>
  );
}
