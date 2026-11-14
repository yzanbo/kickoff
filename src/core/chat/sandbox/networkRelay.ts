// AI の Bash の通信を通す中継（メモの仕様書「0020_AI の書き込み先」の段階 2。ネットワークは絞らない）。
// Claude Code の砂場は外への通信を中継（HTTP_PROXY）だけに絞り、自分の中継では許していない宛先を聞く（Auto mode では Kickoff に聞かずに断る）。
// 砂場の設定で自分の中継の代わりにこれを使わせ、どこへでも通す（2026-11-15 に開発版で、Auto mode でも curl・git・gh が通ることを確かめた）。
// 中継を使わない直接の通信（ssh・nc など）は、砂場がこの Mac の中だけに絞るので通らない
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";

export interface NetworkRelay {
  /** 待っているポート（127.0.0.1） */
  port: number;
  close(): Promise<void>;
}

/** CONNECT（https など）の宛先 host:port を分ける（[v6]:443 も）。読めなければ null */
export function connectTarget(target: string): { host: string; port: number } | null {
  const m = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(target);
  if (!m) return null;
  const port = Number(m[2]);
  return port > 0 && port < 65536 ? { host: m[1]!, port } : null;
}

/** 中継を 127.0.0.1 の空いたポートで起こす（この Mac の中のプロセスからだけ使える） */
export async function startNetworkRelay(): Promise<NetworkRelay> {
  const sockets = new Set<net.Socket>();
  // ふつうの HTTP（絶対 URL の頼み）はそのまま先へ渡す
  const server = http.createServer((req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const upstream = http.request({ host: url.hostname, port: url.port || 80, path: `${url.pathname}${url.search}`, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    upstream.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
    req.pipe(upstream);
  });
  // CONNECT は宛先とのトンネルにする（中身は読まない）
  server.on("connect", (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    const target = connectTarget(req.url ?? "");
    if (!target) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const upstream = net.connect(target.port, target.host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    for (const s of [client, upstream]) {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    }
    upstream.on("error", () => (client.writable ? client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n") : client.destroy()));
    client.on("error", () => upstream.destroy());
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
