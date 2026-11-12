// Docker タブの表示の文（純粋な関数。テストは dockerView.test.ts）
import type { DockerCompose, DockerContainer, DockerPortConflict, DockerService, DockerShare, DockerSilentConflict } from "@shared/types";
import { DOCKER_MARK_LABELS } from "@shared/types";
import { workplaceText } from "@shared/docker/workplace";

/** サービスの行の印の文字（● ○ ✕ ◌ ⏸ ◇） */
export const MARK_GLYPHS: Record<DockerService["mark"], string> = {
  running: "●",
  starting: "◌",
  paused: "⏸",
  failed: "✕",
  created: "○",
  stopped: "○",
  none: "◇",
};

/** サービスの行の様子の文（「止まっている（exit 1）」「×3（2 個動いている）」「tools のときだけ」） */
export function serviceStatusText(s: DockerService): string {
  if (s.containers.length === 0) return s.profiles.length ? `${s.profiles.join("・")} のときだけ` : DOCKER_MARK_LABELS.none;
  if (s.containers.length > 1) return `×${s.containers.length}（${s.running} 個動いている）`;
  const [c] = s.containers;
  if (s.mark === "failed") return c.health === "unhealthy" ? "unhealthy" : `止まっている（exit ${c.exit_code ?? "?"}）`;
  if (s.mark === "created") return "未起動";
  if (s.mark === "stopped") return "止まっている";
  return DOCKER_MARK_LABELS[s.mark];
}

/** Mac に出しているポート（動いているコンテナの分。重ねない） */
export function servicePorts(s: DockerService): number[] {
  const ports = s.containers.filter((c) => c.state === "running").flatMap((c) => c.ports.map((p) => p.host_port));
  return [...new Set(ports)].sort((a, b) => a - b);
}

/**
 * compose で Mac に出すはずのポートのうち、動いているコンテナが出していないもの（ポートの取り合いで起動に失敗したコンテナは、
 * あとで起動してもポートを出さないまま動く。作り直すまで直らない）
 */
export function unpublishedPorts(s: Pick<DockerService, "published" | "containers">): number[] {
  const missing = new Set<number>();
  for (const c of s.containers.filter((x) => x.state === "running")) {
    const host = new Set(c.ports.map((p) => p.host_port));
    for (const p of s.published) if (!host.has(p)) missing.add(p);
  }
  return [...missing].sort((a, b) => a - b);
}

/** 使い捨てのまとめの文（「使い捨て 2 個（1 個動いている）」） */
export function oneoffSummary(oneoffs: DockerContainer[]): string {
  const running = oneoffs.filter((c) => c.state === "running").length;
  return `使い捨て ${oneoffs.length} 個${running ? `（${running} 個動いている）` : ""}`;
}

/** 同じ組の名前になっている相手の ⚠ の文 */
export function shareText(share: DockerShare, compose: Pick<DockerCompose, "project_name" | "file">): string {
  const name = compose.project_name ?? "";
  if (share.kind === "file") {
    const alt = [compose.file, share.file].find((f) => f && /(^|\/)(docker-)?compose\.[^/]+\.ya?ml$/.test(f) && !/\.override\./.test(f)) ?? share.file;
    return `${share.file} と同じ組（${name}）です。片方を起動すると、もう片方の同じ名前のサービスが作り直されます。分けるには ${alt} に name: を書きます`;
  }
  const who = share.other ? `ほかのプロジェクト（${share.other}）` : workplaceText(share.worktree_path, share.branch);
  return `${who}${who.endsWith("）") ? "" : " "}と同じ組（${name}）です。コンテナとデータ（ボリューム）を共有しています`;
}

/** シェルのコマンド（bash があれば bash、なければ sh） */
export const shellCommand = (containerId: string) => `docker exec -it ${containerId} sh -c 'command -v bash >/dev/null && exec bash || exec sh'`;

/** ほかのプロジェクトのコンテナの説明（乗せると名前とポート） */
export function othersTip(others: { name: string; ports: number[] }[]): string {
  return others.map((o) => (o.ports.length ? `${o.name}（${o.ports.map((p) => `:${p}`).join(" ")}）` : o.name)).join("\n");
}

/** ポートの取り合いの相手の 1 行（「:5432 は「本体 | main の db」が使っています」） */
export const conflictText = (c: Pick<DockerPortConflict, "port" | "label">) => `:${c.port} は「${c.label}」が使っています`;

/** ［相手を止めて起動］の文（相手が 1 つならその名前） */
export function stopOthersLabel(conflicts: Pick<DockerPortConflict, "container_id" | "label">[]): string {
  const targets = [...new Map(conflicts.map((c) => [c.container_id, c.label])).values()];
  return targets.length === 1 ? `${targets[0]} を止めて起動` : `相手を止めて起動（${targets.length} 個）`;
}

/** 静かなぶつかりの文（「127.0.0.1:5432 は postgres（PID 123・Homebrew）も開いています。localhost への接続はそちらに行きます」） */
export function silentText(c: Pick<DockerSilentConflict, "address" | "process" | "pid" | "brew_service">): string {
  return `${c.address} は ${c.process}（PID ${c.pid}${c.brew_service ? "・Homebrew" : ""}）も開いています。localhost への接続はそちらに行きます`;
}
