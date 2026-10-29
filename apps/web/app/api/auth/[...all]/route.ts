import { auth } from "@goober/auth/server";
import { toNextJsHandler } from "better-auth/next-js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = toNextJsHandler(auth);

function unavailable() {
  return Response.json({ code: "AUTH_UNAVAILABLE", message: "Account access is temporarily unavailable. Please try again shortly." },
    { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
}

async function handle(request: Request) {
  try {
    const response = await (request.method === "GET" ? handlers.GET(request) : handlers.POST(request));
    // Never forward upstream failure bodies or cookies from an unsuccessful auth operation.
    if (response.status >= 500) return unavailable();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    console.warn("GOOBER auth request unavailable; retry after dependency recovery.");
    return unavailable();
  }
}

export const GET = handle;
export const POST = handle;
