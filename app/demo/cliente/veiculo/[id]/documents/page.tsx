import { FileText } from "lucide-react";
import { RegisterVehicleDocumentForm, RemoveVehicleDocumentForm } from "@/components/customer/vehicle-log-forms";
import { VehicleLogPage } from "@/components/customer/vehicle-log-page";
import { VehicleLogEmpty } from "@/components/customer/vehicle-log-nav";
import { Card, CardContent } from "@/components/ui/card";
import { documentKindLabel } from "@/lib/customer-vehicle-log";
import { requireRole } from "@/services/auth/profile";
import { loadDocumentsHome } from "@/services/customer-vehicle-log/read";

const date = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireRole(["customer"]);
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const { vehicle, documents } = await loadDocumentsHome(id);

  return (
    <VehicleLogPage vehicle={vehicle} active="documents" feedback={feedback}>
      <Card className="border-rose-100 bg-white/90">
        <CardContent className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-accent" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Anexar documento</h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">Os arquivos ficam em armazenamento privado, acessíveis apenas a você.</p>
          <RegisterVehicleDocumentForm vehicleId={vehicle.id} />
        </CardContent>
      </Card>

      <div className="mt-6">
        {documents.length ? (
          <Card className="border-rose-100 bg-white/90">
            <CardContent className="p-6 sm:p-7">
              <h2 className="text-lg font-semibold">Documentos do veículo</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{documentKindLabel(document.document_kind) ?? document.document_kind}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {document.file_name} · {fileSize(document.size_bytes)} · {date.format(new Date(document.document_date))}
                      </p>
                      {document.reference || document.note ? (
                        <p className="mt-1 text-xs text-slate-500">{[document.reference, document.note].filter(Boolean).join(" · ")}</p>
                      ) : null}
                    </div>
                    <RemoveVehicleDocumentForm vehicleId={vehicle.id} documentId={document.id} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <VehicleLogEmpty title="Nenhum documento anexado" message="Anexe documentos como notas fiscais, garantias e manuais — todos em armazenamento privado." />
        )}
      </div>
    </VehicleLogPage>
  );
}