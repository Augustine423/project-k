import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { AuthField, AuthHeader, AuthPasswordToggle } from "./AuthShared";
import {
  validateEmail,
  validatePassword,
  validatePasswordMatch,
} from "./authValidation";

interface ForgotPasswordFormProps {
  email: string;
  onBackToSignIn: () => void;
  onResetComplete: () => void;
}

export function ForgotPasswordRequestForm({
  onContinue,
  onBackToSignIn,
}: {
  onContinue: (email: string) => void;
  onBackToSignIn: () => void;
}) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formMessage, setFormMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormMessage("");

    const emailError = validateEmail(email);
    setFieldError(emailError ?? undefined);
    if (emailError) return;

    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (!result.found) {
        setFormMessage(
          "If an account exists for that email, you can reset your password on the next step.",
        );
      }
      onContinue(result.email);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-view">
      <AuthHeader
        title="Reset your password"
        subtitle="Enter the email on your account and we’ll help you choose a new one."
      />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField
          id="forgot-email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          error={fieldError}
        />

        {formMessage && <p className="auth-banner auth-banner--info">{formMessage}</p>}

        <button className="auth-cta" type="submit" disabled={loading}>
          <span>{loading ? "Checking…" : "Continue"}</span>
        </button>
      </form>

      <p className="auth-switch">
        <button type="button" className="auth-text-btn" onClick={onBackToSignIn}>
          ← Back to sign in
        </button>
      </p>
    </div>
  );
}

export function ForgotPasswordResetForm({
  email,
  onBackToSignIn,
  onResetComplete,
}: ForgotPasswordFormProps) {
  const { resetPassword, accountExists } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [exists, setExists] = useState<boolean | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>(
    {},
  );
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await accountExists(email);
        if (!cancelled) setExists(found);
      } catch {
        if (!cancelled) setExists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountExists, email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const errors = {
      password: validatePassword(password, true) ?? undefined,
      confirmPassword: validatePasswordMatch(password, confirmPassword) ?? undefined,
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    if (!exists) {
      setFormError("No account was found for this email. Create a new account instead.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email, password);
      onResetComplete();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-view">
      <AuthHeader
        title="Choose a new password"
        subtitle={`Updating password for ${email}.`}
      />

      {exists === false && (
        <p className="auth-banner auth-banner--warn">
          We couldn’t find an account for this email. You can still create one from sign up.
        </p>
      )}

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-password-wrap">
          <AuthField
            id="reset-password"
            label="New password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (!value) setShowPassword(false);
            }}
            placeholder="Create a new password"
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

        <AuthField
          id="reset-confirm"
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repeat your new password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
        />

        {formError && <p className="auth-banner auth-banner--error">{formError}</p>}

        <button className="auth-cta" type="submit" disabled={loading || exists !== true}>
          <span>{loading ? "Updating…" : "Update password"}</span>
        </button>
      </form>

      <p className="auth-switch">
        <button type="button" className="auth-text-btn" onClick={onBackToSignIn}>
          ← Back to sign in
        </button>
      </p>
    </div>
  );
}
