import { redirect } from "next/navigation";

/**
 * The old dashboard URL now lives at /student (separate login portal).
 * Keep this route as a redirect so bookmarks and old links keep working.
 */
export default function DashboardRedirect() {
  redirect("/student");
}
