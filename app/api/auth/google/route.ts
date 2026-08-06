import { randomBytes } from "node:crypto";

/**
 * Starts the "Sign in with Google" flow for teachers: redirects to Google's
 * consent screen. The callback exchanges the code and verifies the email is
 * a teacher before issuing a session cookie.
 */
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json(
      { error: "Google login is not configured (GOOGLE_CLIENT_ID missing)" },
      { status: 501 }
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const headers = new Headers({
    Location: url.toString(),
    // CSRF protection: the callback verifies this state cookie.
    "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
  });
  return new Response(null, { status: 302, headers });
}
