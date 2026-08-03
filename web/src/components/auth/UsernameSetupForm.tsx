import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { AuthField, AuthHeader } from "./AuthShared";
import { validateUsername } from "./authValidation";

interface UsernameSetupFormProps {
  onSuccess: () => void;
}

export function UsernameSetupForm({ onSuccess }: UsernameSetupFormProps) {
  const { setUsername, user } = useAuth();
  const [username, setUsernameValue] = useState(user?.username ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const error = validateUsername(username);
    setFieldError(error ?? undefined);
    if (error) return;

    setLoading(true);
    try {
      await setUsername(username.trim());
      onSuccess();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save username.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-view">
      <AuthHeader
        title="Choose your username"
        subtitle="This name appears in meetings for your team."
      />

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <AuthField
          id="setup-username"
          label="Username"
          value={username}
          onChange={setUsernameValue}
          placeholder="e.g. Jane Cooper"
          autoComplete="nickname"
          error={fieldError}
          hint="You can change this later from your profile settings."
        />

        {formError && <p className="auth-banner auth-banner--error">{formError}</p>}

        <button className="auth-cta" type="submit" disabled={loading}>
          <span>{loading ? "Saving…" : "Continue"}</span>
        </button>
      </form>
    </div>
  );
}
