import { PROJECT_HUES, pickProjectHue } from "@shared/project/colors";
import type { GitWorktree } from "@shared/types";
import { branchName, type ChatWorkplace } from "./workplace";

/** 文字列から決まる好みの色（プロジェクトの色と同じ 10 色から。同じ文字列ならいつも同じ色） */
function hashHue(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}

/** 色のもとにする文字列（作業場所別のまとまりのキー `p<プロジェクト>/w:<作業場所>` と同じ形。以前はまとまりのキーから決めていたので、色を変えないため） */
const seedOf = (projectId: number, key: string) => `p${projectId}/w:${key || "main"}`;

/** ワークツリーの一覧ごとに決めた色（一覧は店が入れ替えるまで同じ配列なので、配列ごとに 1 回だけ決める） */
const cache = new WeakMap<GitWorktree[], Map<number, Map<string, number>>>();

/**
 * プロジェクトのいまある作業場所（本体 → ワークツリー（ブランチ名の順）。compareWorkplaces と同じ順）に、互いに被らない色を決める。
 * それぞれキーから決まる好みの色を取り、もう使われていれば、まだ使われていない色からプロジェクトと同じ選び方で選ぶ（10 色を使い切ったら被ってよい）
 */
function liveHues(projectId: number, list: GitWorktree[]): Map<string, number> {
  let byProject = cache.get(list);
  if (!byProject) cache.set(list, (byProject = new Map()));
  const known = byProject.get(projectId);
  if (known) return known;
  const others = list.filter((w) => !w.main && !w.prunable).sort((a, b) => branchName(a).localeCompare(branchName(b)));
  const hues = new Map<string, number>();
  const used: number[] = [];
  for (const key of ["", ...others.map((w) => w.path)]) {
    const wanted = hashHue(seedOf(projectId, key));
    const hue = used.includes(wanted) && used.length < PROJECT_HUES.length ? pickProjectHue(used) : wanted;
    used.push(hue);
    hues.set(key, hue);
  }
  byProject.set(projectId, hues);
  return hues;
}

/**
 * 作業場所の色（色相）。ブランチの印（WorktreeChip）と、タブを作業場所別にまとめたときのまとまりの色（workplaceHead の hue）で同じ色にする。
 * いまある作業場所どうしは被らない色、フォルダなし・以前のブランチ（一覧にない）とまだ一覧を読んでいないときは、キーから決まる色
 */
export function workplaceHue(projectId: number, place: Pick<ChatWorkplace, "key">, list: GitWorktree[] | undefined): number {
  return (list && liveHues(projectId, list).get(place.key)) ?? hashHue(seedOf(projectId, place.key));
}
