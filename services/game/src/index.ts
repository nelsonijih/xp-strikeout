import http from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { StrikeOutRoom } from "./rooms/StrikeOutRoom";
import { config, assertProdSafety } from "./config";

async function main() {
  assertProdSafety();

  // Minimal HTTP for health checks (Fly/compose) alongside the WS transport.
  let draining = false;
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(draining ? 503 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: !draining, service: "game" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });

  // filterBy(matchId): clients that pass the same matchId land in the SAME room.
  gameServer.define("strikeout", StrikeOutRoom).filterBy(["matchId"]);

  await gameServer.listen(config.port);
  console.log(`game (Colyseus) listening on ${config.port}`);

  // Graceful drain (§10): stop taking new rooms, let active matches finish, then exit.
  const shutdown = async () => {
    draining = true;
    console.log("[game] draining — finishing active matches…");
    await gameServer.gracefullyShutdown();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
