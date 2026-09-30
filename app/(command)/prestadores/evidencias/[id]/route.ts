import { requireRole } from "@/services/auth/profile";
import { readHomologationEvidence } from "@/services/provider-homologation/evidence";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await context.params;
  const provider = new URL(request.url).searchParams.get("provider") ?? "";
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const file = await readHomologationEvidence(provider, id);
    const extension = ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[file.type] ?? "bin";
    return new Response(file, { headers: {
      ...headers, "Content-Type": extension === "bin" ? "application/octet-stream" : file.type,
      "Content-Disposition": `${extension === "bin" ? "attachment" : "inline"}; filename="evidencia-${id}.${extension}"`,
    } });
  } catch {
    return new Response("Não foi possível ler esta evidência privada. Não a considere revisada. Volte à homologação e tente novamente.", { status: 503, headers });
  }
}
