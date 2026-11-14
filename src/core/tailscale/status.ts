// この Mac の Tailscale の様子を調べる（設定の「スマホ連携」の Tailscale Serve の案内）。
// コマンドの場所だけが OS ごとに違う（OS の口の tailscaleCli）。答えの JSON の読み方は OS に依らない純粋な関数
import type { TailscaleStatus } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { runCommand } from "../system/exec.js";

/** 調べるのを待つ時間（つながっていないと遅いことがある） */
const TAILSCALE_TIMEOUT_MS = 5_000;

/** Serve を始めるコマンド（この本体のポートへ。--bg で裏に残し、Mac を起動し直しても続く） */
export const serveCommand = (cli: string, port: number) => `${cli.includes(" ") ? `"${cli}"` : cli} serve --bg --https=443 http://127.0.0.1:${port}`;

/** tailscale status --json から、つながっているかと、この Mac の名前（末尾の . は落とす） */
export function parseTailscaleStatus(json: unknown): { running: boolean; dns_name: string | null } {
  const s = json as { BackendState?: string; Self?: { DNSName?: string } } | null;
  const running = s?.BackendState === "Running";
  const name = s?.Self?.DNSName?.replace(/\.$/, "") || null;
  return { running, dns_name: running ? name : null };
}

/** Serve の行き先が、この Mac の中のそのポートか（http://127.0.0.1:4318・http://localhost:4318/・4318 など） */
const proxiesTo = (proxy: string, port: number): boolean => {
  if (proxy === String(port)) return true;
  try {
    const url = new URL(proxy);
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && Number(url.port) === port;
  } catch {
    return false;
  }
};

/**
 * tailscale serve status --json（ServeConfig）から、このポートへ渡している HTTPS の URL と、ほかのポートへ渡しているもの。
 * 形は { Web: { "mac.tailnet.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:4318" } } } } }
 */
export function serveUrlsFor(json: unknown, port: number): { serve_url: string | null; other_serves: string[] } {
  const web = (json as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> } | null)?.Web ?? {};
  let serveUrl: string | null = null;
  const others: string[] = [];
  for (const [hostPort, { Handlers = {} } = {}] of Object.entries(web)) {
    const [host, servePort = "443"] = hostPort.split(/:(?=\d+$)/);
    const base = `https://${host}${servePort === "443" ? "" : `:${servePort}`}`;
    for (const [route, handler] of Object.entries(Handlers)) {
      if (!handler.Proxy) continue;
      const url = route === "/" ? base : `${base}${route}`;
      if (route === "/" && proxiesTo(handler.Proxy, port)) serveUrl ??= url;
      else others.push(`${url} → ${handler.Proxy}`);
    }
  }
  return { serve_url: serveUrl, other_serves: others };
}

/** Tailscale の様子を調べる（コマンドがなければ installed: false。失敗は error に入れて投げない） */
export async function tailscaleStatus(cli: string | null, port: number): Promise<TailscaleStatus> {
  const base: TailscaleStatus = { installed: cli !== null, running: false, dns_name: null, serve_url: null, other_serves: [], command: serveCommand(cli ?? "tailscale", port), error: null };
  if (!cli) return base;
  try {
    const status = parseTailscaleStatus(JSON.parse(await runCommand(cli, ["status", "--json"], { timeout: TAILSCALE_TIMEOUT_MS, okCodes: [1] }) || "null"));
    if (!status.running) return { ...base, ...status };
    const serve = serveUrlsFor(JSON.parse((await runCommand(cli, ["serve", "status", "--json"], { timeout: TAILSCALE_TIMEOUT_MS })) || "null"), port);
    return { ...base, ...status, ...serve };
  } catch (e) {
    return { ...base, error: errorMessage(e) };
  }
}
