"use client";

import { useState, useEffect, useCallback } from "react";
import type { StudentOverview } from "@/types/attendance";

export function useStudentOverview(wallet: string) {
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/student/overview?wallet=${encodeURIComponent(wallet)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to load your attendance");
      }
      setOverview(data as StudentOverview);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load your attendance";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void load();
  }, [load]);

  return { overview, isLoading, error, refresh: load };
}
