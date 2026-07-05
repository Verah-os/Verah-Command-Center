export function LoadingState({ title = "Carregando modulo" }: { title?: string }) {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg border border-border bg-white" />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  );
}
