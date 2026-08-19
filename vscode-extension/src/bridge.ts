import * as http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";

export interface BridgeSession {
  fragment: string;
  close(): void;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Cache-Control": "no-store"
  });
  res.end(encoded);
}

export async function createBridgeSession(prompt: string): Promise<BridgeSession> {
  const sessionId = randomUUID();
  const token = randomBytes(24).toString("hex");

  let server: http.Server;
  let timeout: NodeJS.Timeout;

  server = http.createServer((req, res) => {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const expectedTaskPath = `/task/${sessionId}`;
    const expectedAckPath = `/ack/${sessionId}`;

    if (url.searchParams.get("token") !== token) {
      sendJson(res, 403, { error: "forbidden" });
      return;
    }

    if (req.method === "GET" && url.pathname === expectedTaskPath) {
      sendJson(res, 200, { prompt });
      return;
    }

    if (req.method === "POST" && url.pathname === expectedAckPath) {
      sendJson(res, 200, { ok: true });
      setTimeout(() => server.close(), 250);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not start the localhost bridge.");
  }

  timeout = setTimeout(() => server.close(), 5 * 60 * 1000);
  server.on("close", () => clearTimeout(timeout));

  return {
    fragment: `${address.port}.${sessionId}.${token}`,
    close: () => server.close()
  };
}
