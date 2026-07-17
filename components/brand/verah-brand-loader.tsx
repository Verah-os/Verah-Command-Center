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
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet="/brand/icon.png" />
        {/* eslint-disable-next-line @next/next/no-img-element -- animated GIF is intentionally unoptimized */}
        <img src="/brand/icon-animated.gif" width="64" height="64" alt="" aria-hidden="true" />
      </picture>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
