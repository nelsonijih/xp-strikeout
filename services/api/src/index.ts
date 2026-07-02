import Fastify from "fastify";
import { config, assertProdSafety } from "./config";
import { waitForDb } from "./db";
import { authRoutes } from "./routes/auth";
import { matchRoutes } from "./routes/matches";
import { internalRoutes } from "./routes/internal";
import { startReconcileLoop } from "./reconcile";

async function main() {
  assertProdSafety(); // fail-closed: refuse to boot with bypass flags in prod (§16)

  const app = Fastify({ logger: true });

  // Tolerate empty-body POSTs sent with application/json (join / dev-login have no body).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const s = (body as string) ?? "";
    if (s.trim().length === 0) return done(null, {});
    try {
      done(null, JSON.parse(s));
    } catch (e) {
      done(e as Error);
    }
  });

  // Permissive CORS for local dev (the play client runs on a different origin).
  app.addHook("onRequest", async (req, reply) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-headers", "content-type,authorization,x-internal-token");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") reply.code(204).send();
  });

  app.get("/health", async () => ({ ok: true, service: "api" }));

  await app.register(authRoutes);
  await app.register(matchRoutes);
  await app.register(internalRoutes);

  await waitForDb();
  startReconcileLoop();

  await app.listen({ host: "0.0.0.0", port: config.port });
  app.log.info(`api listening on ${config.port} (bypass=${config.devAuthBypass})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
