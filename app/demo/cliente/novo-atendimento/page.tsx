import { DemoShell } from "@/components/demo/demo-shell";
import { ServiceRequestForm } from "@/components/demo/service-request-form";

export default async function NewServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <DemoShell>
      <section className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">
          Novo atendimento
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          Vamos entender o que aconteceu
        </h1>
        <p className="mb-8 mt-3 text-slate-600">
          Preencha com calma. Você poderá revisar a análise antes de criar o
          atendimento.
        </p>
        <ServiceRequestForm serverError={error} />
      </section>
    </DemoShell>
  );
}
