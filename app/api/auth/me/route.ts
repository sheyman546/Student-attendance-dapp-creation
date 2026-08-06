import { getTeacherSessionEmail } from "@/lib/auth";

/** Returns the email of the current teacher session cookie (or null). */
export async function GET(request: Request) {
  return Response.json({ email: getTeacherSessionEmail(request) });
}
