"use client";

import { useMemo, useState } from "react";
import { modules } from "@/modules/registry";

export function useCommandSearch() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return modules;
    return modules.filter((module) => `${module.title} ${module.description}`.toLowerCase().includes(normalized));
  }, [query]);

  return { query, setQuery, results };
}
