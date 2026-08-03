export type AuthView = "signin" | "signup" | "forgot-request" | "forgot-reset" | "username";

export interface SignUpPayload {
  displayName: string;
  email: string;
  password: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(password: string, forSignUp = false): string | null {
  if (!password) return "Password is required.";
  if (forSignUp) {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
    if (!/[0-9]/.test(password)) return "Password must include at least one number.";
    return null;
  }
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export function validatePasswordMatch(password: string, confirm: string): string | null {
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export function validateDisplayName(name: string): string | null {
  const value = name.trim();
  if (!value) return "Full name is required.";
  if (value.length < 2) return "Full name must be at least 2 characters.";
  return null;
}

export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) return "Username is required.";
  if (value.length < 2) return "Username must be at least 2 characters.";
  if (value.length > 64) return "Username must be 64 characters or fewer.";
  if (!/^[a-zA-Z0-9._\- ]+$/.test(value)) {
    return "Use letters, numbers, spaces, dots, underscores, or hyphens.";
  }
  return null;
}
