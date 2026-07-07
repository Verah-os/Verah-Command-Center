import { Card, CardContent, CardHeader } from "@/components/ui/card";

const cards = ["System Online", "GitHub", "Runtime", "Atlas"];

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">VERAH Command Center</h1>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((title) => (
          <Card key={title}>
            <CardHeader>
              <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">Ready</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
