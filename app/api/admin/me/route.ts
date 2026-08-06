import {
  getOwnerAddress,
  isAdminWallet,
  isTeacherWallet,
  getTeacherSessionEmail,
  isTeacherEmail,
} from "@/lib/auth";

/**
 * Role discovery for the teacher portal. Given an optional connected wallet,
 * reports whether that wallet is the admin (owner) or a teacher, and whether
 * the request carries a valid Google-login teacher session. No sensitive data
 * is exposed — the wallet address and owner address are public.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet")?.toLowerCase() ?? "";
  const ownerAddress = getOwnerAddress();

  const isAdmin = wallet ? isAdminWallet(wallet) : false;
  const isTeacher = wallet ? await isTeacherWallet(wallet) : false;

  let teacherEmail = getTeacherSessionEmail(request);
  if (teacherEmail && !(await isTeacherEmail(teacherEmail))) {
    teacherEmail = null;
  }

  return Response.json({
    isAdmin,
    isTeacher,
    ownerAddress,
    teacherEmail,
  });
}
