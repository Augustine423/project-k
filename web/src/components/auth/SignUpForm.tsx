import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { AuthField, AuthHeader, AuthPasswordToggle, AuthSocialButtons } from "./AuthShared";
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
} from "./authValidation";

interface SignUpFormProps {
  onSwitchSignIn: () => void;
  onSuccess: () => void;
  onSocial?: (provider: "google" | "slack") => void;
}

export function SignUpForm({ onSwitchSignIn, onSuccess, onSocial }: SignUpFormProps) {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const errors = {
      displayName: validateDisplayName(displayName) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password, true) ?? undefined,
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setLoading(true);
    try {
      await signUp(email, password, displayName);
      onSuccess();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-view">
      <AuthHeader
        title="Create your account"
        subtitle="Set up MeetingMax and bring your team together."
      />

      <AuthSocialButtons onSocial={onSocial} />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField
          id="signup-name"
          label="Full name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="Jane Cooper"
          autoComplete="name"
          error={fieldErrors.displayName}
        />

        <AuthField
          id="signup-email"
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          error={fieldErrors.email}
        />

        <div className="auth-password-wrap">
          <AuthField
            id="signup-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (!value) setShowPassword(false);
            }}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={fieldErrors.password}
            hint="Use 8+ characters with a letter and a number."
          />
          <AuthPasswordToggle
            active={password.length > 0}
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </div>

        {formError && <p className="auth-banner auth-banner--error">{formError}</p>}

        <button className="auth-cta" type="submit" disabled={loading}>
          <span>{loading ? "Creating account…" : "Sign up"}</span>
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{" "}
        <button type="button" className="auth-text-btn auth-text-btn--strong" onClick={onSwitchSignIn}>
          Sign in
        </button>
      </p>
    </div>
  );
}
