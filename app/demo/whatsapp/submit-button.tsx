"use client";

import { useFormStatus } from "react-dom";

export function SyntheticDemoSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-700 px-6 font-semibold text-white shadow-sm outline-none hover:bg-teal-800 focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-wait disabled:bg-teal-500"
    >
      {pending ? "Criando atendimento…" : "Executar demonstração sintética"}
    </button>
  );
}
