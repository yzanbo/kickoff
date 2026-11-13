// compose の公開ポートの読み方と、ワークツリーの上書きファイル（.kickoff/compose.worktree.yaml）の中身（純粋な関数）

/** サービスの ports の 1 つ（compose の config --format json の形から読んだもの） */
export interface ComposePort {
  target: number;
  /** Mac に出す番号（出さない・範囲などで数でなければ null） */
  published: number | null;
  /** published を書いたままの文（範囲の「8000-8010」など。出さなければ null） */
  published_raw: string | null;
  host_ip: string | null;
  protocol: string;
}

/** config --format json を読んだものから、サービスごとの ports（ports のないサービスは入れない） */
export function composePortsOf(doc: unknown): Map<string, ComposePort[]> {
  const out = new Map<string, ComposePort[]>();
  const services = (doc as { services?: unknown } | null)?.services;
  if (!services || typeof services !== "object") return out;
  for (const [name, svc] of Object.entries(services as Record<string, { ports?: unknown }>)) {
    if (!Array.isArray(svc?.ports)) continue;
    const ports: ComposePort[] = [];
    for (const p of svc.ports as Record<string, unknown>[]) {
      const target = Number(p.target);
      if (!Number.isInteger(target) || target <= 0) continue;
      const raw = p.published === undefined || p.published === null || p.published === "" ? null : String(p.published);
      const published = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
      ports.push({ target, published, published_raw: raw, host_ip: typeof p.host_ip === "string" && p.host_ip ? p.host_ip : null, protocol: typeof p.protocol === "string" && p.protocol ? p.protocol : "tcp" });
    }
    if (ports.length) out.set(name, ports);
  }
  return out;
}

/** ports の 1 つを compose の短い書き方にする（published を to に替える。to が null なら書いたまま） */
export function portSpec(port: ComposePort, to: number | null): string {
  const proto = port.protocol !== "tcp" ? `/${port.protocol}` : "";
  const published = to !== null ? String(to) : port.published_raw;
  if (published === null) return `${port.target}${proto}`;
  const ip = port.host_ip ? (port.host_ip.includes(":") ? `[${port.host_ip}]:` : `${port.host_ip}:`) : "";
  return `${ip}${published}:${port.target}${proto}`;
}

/** 上書きファイルの中身（サービスごとに ports を !override で置き換える。名前と値は JSON の文字列 = YAML の囲んだ文字列で書く） */
export function overrideYaml(services: readonly { name: string; ports: readonly string[] }[]): string {
  const lines = ["# Kickoff が書いたファイル（ワークツリーの実行環境。ポートを帯の番号にする）。.git/info/exclude で Git に無視させています", services.length ? "services:" : "services: {}"];
  for (const s of services) {
    lines.push(`  ${JSON.stringify(s.name)}:`, `    ports: !override [${s.ports.map((p) => JSON.stringify(p)).join(", ")}]`);
  }
  return `${lines.join("\n")}\n`;
}
