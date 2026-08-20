import { timingSafeEqual } from "node:crypto";

export async function handleN8nWorkerRequest(
  request: Request,
  dependencies: {
    secret: string;
    enabled: boolean;
    available: boolean;
    run(): Promise<unknown>;
  },
) {
  if (dependencies.secret.length < 32) {
    return Response.json({ error: "worker_unavailable" }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(supplied, dependencies.secret)) {
    return Response.json({ error: "access_denied" }, { status: 401 });
  }
  if (!dependencies.enabled) {
    return Response.json({ status: "disabled" });
  }
  if (!dependencies.available) {
    return Response.json({ status: "transport_unavailable" });
  }
  return Response.json(await dependencies.run());
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
