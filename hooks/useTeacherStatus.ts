"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/hooks/useWallet";
import type { TeacherStatus } from "@/types/attendance";

export function useTeacherStatus() {
  const { address } = useWallet();
  const [status, setStatus] = useState<TeacherStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = address
        ? `?wallet=${encodeURIComponent(address)}`
        : "";
      const res = await fetch(`/api/admin/me${query}`);
      const data = (await res.json()) as TeacherStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  const canAccess =
    !!status && (status.isAdmin || status.isTeacher || !!status.teacherEmail);

  return { status, isLoading, canAccess, refresh: load };
}
