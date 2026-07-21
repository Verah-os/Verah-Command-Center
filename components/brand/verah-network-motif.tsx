import { cn } from "@/lib/utils";

export function VerahNetworkMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 96"
      className={cn("verah-network-motif", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 63h52l36-35h71l32 36h62l30-27h69" />
      <path d="M38 84a52 52 0 0 1 86-58" />
      <path d="M257 18a45 45 0 0 1 58 63" />
      <circle cx="5" cy="63" r="3" />
      <circle cx="57" cy="63" r="5" />
      <circle cx="93" cy="28" r="4" />
      <circle cx="164" cy="28" r="3" />
      <circle cx="196" cy="64" r="5" />
      <circle cx="258" cy="64" r="3" />
      <circle cx="288" cy="37" r="5" />
      <circle cx="357" cy="37" r="3" />
    </svg>
  );
}
