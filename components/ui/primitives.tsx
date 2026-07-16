import type {
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const control = "min-h-11 w-full rounded-md border border-border bg-muted px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-28 py-3", className)} {...props} />;
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("h-5 w-5 rounded border-border accent-[var(--verah-pink)]", className)} {...props} />;
}

export function Radio({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="radio" className={cn("h-5 w-5 border-border accent-[var(--verah-pink)]", className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground", className)} {...props} />;
}

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="status" className={cn("rounded-md border border-border bg-muted p-4 text-sm text-foreground", className)} {...props} />;
}

export function Dialog({ className, ...props }: HTMLAttributes<HTMLDialogElement>) {
  return <dialog className={cn("w-[min(92vw,34rem)] rounded-lg border border-border bg-card p-6 text-card-foreground shadow-card backdrop:bg-black/70", className)} {...props} />;
}

export function Tabs({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav aria-label="Abas" className={cn("flex max-w-full gap-2 overflow-x-auto rounded-md border border-border bg-card p-2", className)} {...props} />;
}

export function Navigation({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <nav className={cn("flex items-center gap-2", className)} {...props} />;
}

export function Timeline({ className, ...props }: HTMLAttributes<HTMLOListElement>) {
  return <ol className={cn("border-l border-border pl-5", className)} {...props} />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-sm bg-muted", className)} {...props} />;
}
