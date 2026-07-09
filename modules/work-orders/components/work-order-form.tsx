import Link from "next/link";
import { createWorkOrder } from "@/services/work-orders/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const priorities = ["Low", "Medium", "High", "Critical"];
const origins = ["Manual", "GitHub", "Dispatcher", "AI"];

export function WorkOrderForm({ error }: { error?: string }) {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-muted-foreground">Work Orders</p>
        <h1 className="text-2xl font-semibold">New Work Order</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Crie uma Work Order operacional. O Dispatcher Job sera criado automaticamente pela trigger do Supabase.
        </p>
      </section>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Details</h2>
        </CardHeader>
        <CardContent>
          <form action={createWorkOrder} className="space-y-4">
            <label className="block text-sm font-medium">
              Title
              <input
                className="mt-1 h-10 w-full rounded-md border border-border px-3"
                name="title"
                required
              />
            </label>

            <label className="block text-sm font-medium">
              Description
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border border-border px-3 py-2"
                name="description"
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium">
                Category
                <input className="mt-1 h-10 w-full rounded-md border border-border px-3" name="category" />
              </label>

              <label className="block text-sm font-medium">
                Owner
                <input className="mt-1 h-10 w-full rounded-md border border-border px-3" name="owner" />
              </label>

              <label className="block text-sm font-medium">
                Priority
                <select
                  className="mt-1 h-10 w-full rounded-md border border-border px-3"
                  name="priority"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select priority
                  </option>
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                Origin
                <select
                  className="mt-1 h-10 w-full rounded-md border border-border px-3"
                  name="origin"
                  defaultValue="Manual"
                >
                  {origins.map((origin) => (
                    <option key={origin} value={origin}>
                      {origin}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <p className="text-sm text-accent">{error}</p> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit">Save Work Order</Button>
              <Link
                className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                href="/work-orders"
              >
                Cancel
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
