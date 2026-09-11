"use client";

import { useFormStatus } from "react-dom";

export function SyntheticDemoSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-6 font-semibold text-white shadow-sm outline-none hover:bg-accent focus-visible:ring-4 focus-visible:ring-accent/30 disabled:cursor-wait disabled:bg-accent/100"
    >
      {pending ? "Criando atendimento…" : "Executar demonstração sintética"}
    </button>
  );
}
