"use client";

import { ErrorState } from "@/components/state/error-state";

export default function Error({ reset }: { reset: () => void }) {
  return <ErrorState title="Erro no Atlas" reset={reset} />;
}
