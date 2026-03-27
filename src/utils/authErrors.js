const LOGIN_DEFAULT_ERROR = "Couldn't sign you in. Please try again.";
const SIGNUP_DEFAULT_ERROR = "Couldn't create your account. Please try again.";

export const getFriendlyAuthErrorMessage = (rawMessage, flow = "login") => {
  const message = String(rawMessage || "").trim();
  const normalized = message.toLowerCase();
  const fallback = flow === "signup" ? SIGNUP_DEFAULT_ERROR : LOGIN_DEFAULT_ERROR;

  if (!normalized) {
    return fallback;
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed") ||
    normalized.includes("load failed") ||
    normalized.includes("fetch failed")
  ) {
    return "Can't reach the server right now. Please check your connection and try again.";
  }

  if (normalized.includes("invalid credentials")) {
    return "Email or password is incorrect.";
  }

  if (normalized.includes("email and password are required")) {
    return "Please enter both your email and password.";
  }

  if (normalized.includes("full name, email, and password are required")) {
    return "Please fill in your full name, email, and password.";
  }

  if (normalized.includes("email already exists")) {
    return "This email is already registered. Try signing in instead.";
  }

  return fallback;
};
