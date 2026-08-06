import { authorizeAdminOrTeacher } from "@/lib/auth";
import { getCourseOnChain } from "@/lib/proof";
import type { CourseSummary } from "@/types/attendance";

const CODE_REGEX = /^[A-Za-z0-9-]{1,16}$/;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Lists courses with their session counts. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const auth = await authorizeAdminOrTeacher(request, {
    wallet: searchParams.get("wallet") ?? undefined,
    message: searchParams.get("message") ?? undefined,
    signature: searchParams.get("signature") ?? undefined,
  });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const courses = await prisma.course.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { sessions: true } } },
    });

    const list: CourseSummary[] = courses.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      onChainId: c.onChainId,
      sessionCount: c._count.sessions,
    }));

    return Response.json({ courses: list });
  } catch (error) {
    console.error("Failed to list courses:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}

/**
 * Creates a course. The admin/teacher first sends createCourse(code, name)
 * from their browser wallet; this route mirrors the on-chain course into the
 * database (keyed by code) along with the on-chain course id from the
 * CourseCreated event.
 */
export async function POST(request: Request) {
  let body: {
    wallet?: unknown;
    message?: unknown;
    signature?: unknown;
    code?: unknown;
    name?: unknown;
    txHash?: unknown;
    onChainId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const auth = await authorizeAdminOrTeacher(request, {
    wallet: typeof body.wallet === "string" ? body.wallet : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    signature: typeof body.signature === "string" ? body.signature : undefined,
  });
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const txHash = typeof body.txHash === "string" ? body.txHash : "";
  const onChainId =
    typeof body.onChainId === "string" ? Number(body.onChainId) : NaN;

  if (!CODE_REGEX.test(code)) {
    return Response.json(
      { error: "Course code must be 1-16 letters, digits or dashes" },
      { status: 400 }
    );
  }
  if (!name || name.length > 64) {
    return Response.json(
      { error: "Course name is required (max 64 characters)" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(onChainId) || onChainId <= 0) {
    return Response.json(
      { error: "The on-chain course id is required" },
      { status: 400 }
    );
  }
  if (!txHash) {
    return Response.json(
      { error: "The createCourse transaction hash is required" },
      { status: 400 }
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");

    // Best-effort: confirm the on-chain course matches what we were told.
    const onChain = await getCourseOnChain(onChainId);
    if (onChain && (onChain.code !== code || onChain.name !== name)) {
      return Response.json(
        { error: "On-chain course details do not match" },
        { status: 400 }
      );
    }

    let course;
    try {
      course = await prisma.course.upsert({
        where: { code },
        update: { name, onChainId },
        create: { code, name, onChainId },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return Response.json(
          { error: "A course with that code already exists" },
          { status: 409 }
        );
      }
      throw error;
    }

    return Response.json(
      {
        course: {
          id: course.id,
          code: course.code,
          name: course.name,
          onChainId: course.onChainId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create course:", error);
    return Response.json(
      { error: "Database not available. Make sure DATABASE_URL is set and prisma generate has been run." },
      { status: 503 }
    );
  }
}
