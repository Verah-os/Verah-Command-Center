import { VerahLogo } from "@/components/brand/verah-logo";
import { cn } from "@/lib/utils";

export function VerahBrandLoader({
  className,
  label = "Carregando",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)} role="status">
      <VerahLogo kind="symbol" tone="light" size="lg" alt="" className="verah-loader-mark" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
