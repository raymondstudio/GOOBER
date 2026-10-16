import { auth } from "@goober/auth/server";
import { toNextJsHandler } from "better-auth/next-js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = toNextJsHandler(auth);
