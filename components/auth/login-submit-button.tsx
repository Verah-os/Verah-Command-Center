"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-full"
      type="submit"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Validando acesso..." : "Entrar"}
    </Button>
  );
}
