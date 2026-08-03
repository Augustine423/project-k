import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { AuthField, AuthHeader, AuthPasswordToggle, AuthSocialButtons } from "./AuthShared";
import { validateEmail, validatePassword } from "./authValidation";

interface SignInFormProps {
  onSwitchSignUp: () => void;
  onForgotPassword: () => void;
  onSuccess: (needsUsername: boolean) => void;
  onSocial?: (provider: "google" | "slack") => void;
}

export function SignInForm({
  onSwitchSignUp,
  onForgotPassword,
  onSuccess,
  onSocial,
}: SignInFormProps) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    setFieldErrors({ email: emailError ?? undefined, password: passwordError ?? undefined });
    if (emailError || passwordError) return;

    setLoading(true);
    try {
      const sessionUser = await signIn(email, password);
      onSuccess(sessionUser.needsUsername);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-view">
      <AuthHeader subtitle="Sign in to jump into your next meeting." />

      <AuthSocialButtons onSocial={onSocial} />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField
          id="signin-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          error={fieldErrors.email}
        />

        <div className="auth-password-wrap">
          <AuthField
            id="signin-password"
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (!value) setShowPassword(false);
            }}
            placeholder="Your password"
            autoComplete="current-password"
            error={fieldErrors.password}
          />
          <AuthPasswordToggle
            active={password.length > 0}
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />
        </div>

        <div className="auth-form-meta">
          <button type="button" className="auth-text-btn" onClick={onForgotPassword}>
            Forgot password?
          </button>
        </div>

        {formError && <p className="auth-banner auth-banner--error">{formError}</p>}

        <button className="auth-cta" type="submit" disabled={loading}>
          <span>{loading ? "Signing in…" : "Sign in"}</span>
        </button>
      </form>

      <p className="auth-switch">
        New here?{" "}
        <button type="button" className="auth-text-btn auth-text-btn--strong" onClick={onSwitchSignUp}>
          Create an account
        </button>
      </p>
    </div>
  );
}
