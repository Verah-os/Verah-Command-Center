import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ title, reset }: { title: string; reset?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-danger" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nao foi possivel carregar este modulo operacional.</p>
          {reset ? (
            <Button className="mt-4" onClick={reset} variant="secondary">Tentar novamente</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
