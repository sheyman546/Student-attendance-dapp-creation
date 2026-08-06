import { clearTeacherSessionCookieHeader } from "@/lib/auth";

export async function GET() {
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearTeacherSessionCookieHeader() },
  });
}
