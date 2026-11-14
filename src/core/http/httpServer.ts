import { serve, type ServerType } from "@hono/node-server";
import type { Hono } from "hono";
import { WebSocketServer } from "ws";

/** HTTP サーバーを起動する（待ち受けを始めたら返る）。WebSocket の口（ターミナル）も受ける */
export function startHttpServer(app: Hono, { port, host }: { port: number; host: string }): Promise<ServerType> {
  return new Promise<ServerType>((resolve, reject) => {
    const wss = new WebSocketServer({ noServer: true });
    const server = serve({ fetch: app.fetch, port, hostname: host, websocket: { server: wss } }, () => resolve(server));
    server.once("close", () => wss.close());
    server.once("error", reject);
  });
}

/**
 * HTTP サーバーを止める。開いたままの接続（画面のリアルタイム配信など）があると close が終わらず、
 * アプリの終了まで止まってしまうので、接続もすべて切る
 */
export function stopHttpServer(server: ServerType): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    if ("closeAllConnections" in server) server.closeAllConnections();
  });
}
