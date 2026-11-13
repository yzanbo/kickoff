// ポートの帯（ワークツリーごとに 100 個ずつの番号のまとまり）の選び方と、帯の中の番号の並べ方（純粋な関数）
import { WORKTREE_BAND_FIRST, WORKTREE_BAND_LAST, WORKTREE_BAND_SIZE, type WorktreePortSlot } from "@shared/types";

/** 番号が入る帯の先頭 */
export const bandOf = (port: number) => Math.floor(port / WORKTREE_BAND_SIZE) * WORKTREE_BAND_SIZE;

/**
 * 空いている一番小さい帯（なければ null）。taken はほかのワークツリーに渡してある帯、listening はいま待ち受けている番号
 * （Docker の外のプロセスも含む。帯の中に 1 つでもあれば飛ばす）
 */
export function pickBand(taken: ReadonlySet<number>, listening: readonly number[]): number | null {
  const busy = new Set(listening.map(bandOf));
  for (let band = WORKTREE_BAND_FIRST; band <= WORKTREE_BAND_LAST; band += WORKTREE_BAND_SIZE) {
    if (!taken.has(band) && !busy.has(band)) return band;
  }
  return null;
}

/** 番号を割り当てたい Docker の公開ポート（compose のフォルダ → サービス名 → コンテナ側の番号の順に並べて渡す） */
export type DockerSlotWant = Pick<WorktreePortSlot, "compose_dir" | "service" | "target" | "protocol" | "original">;

/** 同じ公開ポートかを比べる印 */
export const slotKey = (s: Pick<WorktreePortSlot, "kind" | "compose_dir" | "service" | "target" | "protocol">) =>
  s.kind === "dev" ? "dev" : `docker:${s.compose_dir}:${s.service}:${s.target}/${s.protocol ?? "tcp"}`;

/** Docker の公開ポートの並び（compose のフォルダ → サービス名 → コンテナ側の番号 → プロトコル） */
export function compareDockerWants(a: DockerSlotWant, b: DockerSlotWant): number {
  return (
    (a.compose_dir ?? "").localeCompare(b.compose_dir ?? "") ||
    (a.service ?? "").localeCompare(b.service ?? "") ||
    (a.target ?? 0) - (b.target ?? 0) ||
    (a.protocol ?? "").localeCompare(b.protocol ?? "")
  );
}

/**
 * 帯の中の番号を割り当てる: +00 はいつも開発サーバー、+01 から先は Docker の公開ポートを並び順に。
 * 前に割り当てたもの（existing）は同じ番号のまま（本体の番号 original だけ今のものにする）、新しく増えたものには空いている次の番号を渡す（compose から消えたものの番号も空いている）。
 * 帯に収まらなかったものは overflow で返す
 */
export function assignSlots(band: number, existing: readonly WorktreePortSlot[], wants: readonly DockerSlotWant[]): { slots: WorktreePortSlot[]; overflow: DockerSlotWant[] } {
  const before = new Map(existing.filter((s) => s.port >= band + 1 && s.port < band + WORKTREE_BAND_SIZE).map((s) => [slotKey(s), s]));
  // 今も使うものの番号だけを埋まっているものにする（compose から消えたものの番号は、増えたものに渡してよい）
  const wanted = new Set(wants.map((w) => slotKey({ kind: "docker", ...w })));
  const used = new Set<number>([band, ...[...before.entries()].filter(([key]) => wanted.has(key)).map(([, s]) => s.port)]);
  const slots: WorktreePortSlot[] = [{ kind: "dev", compose_dir: null, service: null, target: null, protocol: null, original: null, port: band }];
  const overflow: DockerSlotWant[] = [];
  let next = band + 1;
  for (const want of [...wants].sort(compareDockerWants)) {
    const kept = before.get(slotKey({ kind: "docker", ...want }));
    if (kept) {
      slots.push({ ...kept, original: want.original });
      continue;
    }
    while (used.has(next)) next++;
    if (next >= band + WORKTREE_BAND_SIZE) {
      overflow.push(want);
      continue;
    }
    used.add(next);
    slots.push({ kind: "docker", ...want, port: next });
  }
  return { slots: slots.sort((a, b) => a.port - b.port), overflow };
}
