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
    return new Response(file, { headers: {
      ...headers, "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="evidencia-${id}"`,
    } });
  } catch {
    return new Response("Não foi possível ler esta evidência privada. Não a considere revisada. Volte à homologação e tente novamente.", { status: 503, headers });
  }
}
