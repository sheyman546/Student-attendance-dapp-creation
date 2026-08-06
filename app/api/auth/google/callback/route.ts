import {
  createTeacherSessionToken,
  teacherSessionCookieHeader,
  isTeacherEmail,
} from "@/lib/auth";

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

function redirect(location: string, extraHeaders: HeadersInit = {}) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...extraHeaders },
  });
}

/**
 * Callback for the Google OAuth flow. Exchanges the authorization code for an
 * ID token, verifies it with Google (email + email_verified), checks the
 * email is an allowed teacher, then issues the teacher session cookie.
 */
export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirect("/admin?oauth=not_configured");
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // CSRF: the state must match the cookie set by the start endpoint.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("oauth_state="))
    ?.slice("oauth_state=".length);
  if (!state || !stateCookie || state !== stateCookie) {
    return redirect("/admin?oauth=state_mismatch");
  }

  if (!code) {
    return redirect("/admin?oauth=error");
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  try {
    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = (await tokenRes.json()) as { id_token?: string };
    if (!tokenRes.ok || !tokenData.id_token) {
      return redirect("/admin?oauth=error");
    }

    // Google validates the ID token signature for us via tokeninfo.
    const infoRes = await fetch(
      `${OAUTH_TOKENINFO_URL}?id_token=${encodeURIComponent(tokenData.id_token)}`
    );
    const info = (await infoRes.json()) as {
      email?: string;
      email_verified?: string | boolean;
      aud?: string;
    };
    if (!infoRes.ok || info.email_verified !== "true" || !info.email) {
      return redirect("/admin?oauth=unverified");
    }
    if (info.aud && info.aud !== clientId) {
      return redirect("/admin?oauth=unverified");
    }

    if (!(await isTeacherEmail(info.email))) {
      return redirect("/admin?oauth=not_teacher");
    }

    const token = createTeacherSessionToken(info.email);
    return redirect("/admin?oauth=success", {
      "Set-Cookie": teacherSessionCookieHeader(token),
    });
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return redirect("/admin?oauth=error");
  }
}
