// Docker タブの一覧の組み立て（純粋な関数）: コンテナを作業場所と組に振り分け、見つけた compose のファイルと合わせて見出しを作る。
// どれをこのプロジェクトのものとするかは、コンテナの working_dir がいちばん深く入る作業場所（仕様書の 5 章）
import path from "node:path";
import { workplaceText } from "@shared/docker/workplace";
import { relativeApiPath } from "../system/paths.js";
import type { DockerCompose, DockerContainer, DockerLogSource, DockerOtherContainer, DockerService, DockerShare } from "@shared/types";
import { dbKindOf, deepestWorkplace, parsePorts, parseStatus, serviceMark, type ComposeConfig, type RawContainer } from "./parse.js";

/** 作業場所（path は realpath でそろえたもの） */
export interface Workplace {
  path: string;
  /** null = 本体 */
  worktree_path: string | null;
  branch: string | null;
}

/** compose のファイル 1 つ分の読み取り（見つけたファイルと、作ったコンテナのラベルにあるファイル） */
export interface ComposeEntry {
  /** 作業場所の path */
  workplace: string;
  /** 見出しに出す compose のファイル（絶対パス。override でないもの） */
  file: string;
  /** up に -f で渡すファイル（override・COMPOSE_FILE の並びを含む） */
  upFiles: string[];
  /** up に渡すファイルがすべてあるか */
  filesExist: boolean;
  config: ComposeConfig | null;
  /** config を読めなかったときの標準エラー */
  error: string | null;
  /** config --hash '*' の指紋（作ってあるときだけ取る） */
  hashes: Map<string, string> | null;
  /** 探して見つけたファイルか（ラベルからだけのものは、コンテナがなくなったら出さない） */
  discovered: boolean;
}

export interface BuiltList {
  composes: Omit<DockerCompose, "operation" | "failure">[];
  others: DockerOtherContainer[];
  /** コンテナの ID → 見出しのキー（このプロジェクトのもの） */
  owner: Map<string, string>;
}

const isOverride = (file: string) => /\.override\.ya?ml$/.test(file);
/** コンテナのラベルの config_files のうち、見出しに使うもの（override でない最初のもの） */
export const headFileOf = (c: RawContainer) => c.files.find((f) => !isOverride(f)) ?? c.files[0] ?? null;

/** 見出しのキー */
export const composeKeyOf = (workplace: string, project: string | null, file: string | null) => `${workplace}|${project ?? ""}|${file ?? ""}`;

function toContainer(c: RawContainer): DockerContainer {
  const { exitCode, health } = parseStatus(c.status);
  return { id: c.id, name: c.name, image: c.image, state: c.state, status: c.status, exit_code: exitCode, health, ports: parsePorts(c.ports), number: c.number };
}

/** サービスの行（設定のサービスに、設定にないコンテナのサービスを足す。札付きは後ろ） */
function servicesOf(config: ComposeConfig | null, containers: RawContainer[]): DockerService[] {
  const names = new Set([...(config?.services.map((s) => s.name) ?? []), ...containers.map((c) => c.service ?? "").filter(Boolean)]);
  // 札付きのサービス（ふだんの up では起動しない）は後ろに、それぞれ名前の順
  const optional = (name: string) => (config?.services.find((s) => s.name === name)?.profiles.length ?? 0) > 0;
  return [...names]
    .sort((a, b) => Number(optional(a)) - Number(optional(b)) || a.localeCompare(b))
    .map((name) => {
      const fromConfig = config?.services.find((s) => s.name === name);
      const mine = containers.filter((c) => c.service === name);
      const regular = mine.filter((c) => !c.oneoff).sort((a, b) => a.number - b.number);
      const marks = regular.map((c) => ({ state: c.state, ...parseStatus(c.status) }));
      const image = fromConfig?.image ?? regular[0]?.image ?? mine[0]?.image ?? null;
      return {
        name,
        image,
        profiles: fromConfig?.profiles ?? [],
        published: fromConfig?.published ?? [],
        containers: regular.map(toContainer),
        oneoffs: mine.filter((c) => c.oneoff).map(toContainer),
        mark: serviceMark(marks),
        running: regular.filter((c) => c.state === "running").length,
        db_kind: dbKindOf(image),
      };
    });
}

/** 作ったときから設定が変わったか（サービスごとに、コンテナのラベルの指紋といまの指紋を比べる。1 つでも違えば変わった） */
function configChanged(hashes: Map<string, string> | null, containers: RawContainer[]): boolean {
  if (!hashes) return false;
  return containers.some((c) => !c.oneoff && c.service && c.hash && hashes.has(c.service) && hashes.get(c.service) !== c.hash);
}

/**
 * 一覧を組み立てる。containers の dir は realpath でそろえておく。
 * 動いているコンテナは組の名前と working_dir でまとめ、同じ作業場所の 2 つ以上の compose が同じ組の名前になるときだけ config_files の最初のファイルで振り分ける
 */
export function buildDockerList(workplaces: readonly Workplace[], containers: readonly RawContainer[], entries: readonly ComposeEntry[]): BuiltList {
  const others: RawContainer[] = [];
  const groups = new Map<string, { wp: Workplace; project: string; list: RawContainer[] }>();
  for (const c of containers) {
    const wp = c.project && c.dir ? deepestWorkplace(c.dir, workplaces) : undefined;
    if (!wp || !c.project) {
      others.push(c);
      continue;
    }
    const key = `${wp.path}\n${c.project}\n${c.dir}`;
    const g = groups.get(key) ?? { wp, project: c.project, list: [] };
    g.list.push(c);
    groups.set(key, g);
  }

  type Draft = { wp: Workplace; project: string | null; entry: ComposeEntry | null; file: string | null; list: RawContainer[] };
  const drafts: Draft[] = [];
  const used = new Set<ComposeEntry>();
  for (const g of groups.values()) {
    const inWp = entries.filter((e) => e.workplace === g.wp.path);
    const byName = inWp.filter((e) => e.config?.name === g.project);
    if (byName.length >= 2) {
      // 同じ作業場所の compose が同じ組の名前: コンテナを config_files の最初のファイルで振り分ける（合わなければ最初の見出し）
      for (const e of byName) used.add(e);
      for (const e of byName) drafts.push({ wp: g.wp, project: g.project, entry: e, file: e.file, list: [] });
      const mine = drafts.slice(-byName.length);
      for (const c of g.list) (mine.find((d) => d.file === headFileOf(c)) ?? mine[0]).list.push(c);
      continue;
    }
    const head = headFileOf(g.list[0]);
    const entry = byName[0] ?? inWp.find((e) => e.file === head) ?? null;
    if (entry) used.add(entry);
    drafts.push({ wp: g.wp, project: g.project, entry, file: entry?.file ?? head, list: g.list });
  }
  // まだ作っていない compose（見つけたファイルで、どの組にも使われなかったもの）
  for (const e of entries) {
    if (used.has(e) || !e.discovered) continue;
    const wp = workplaces.find((w) => w.path === e.workplace);
    if (wp) drafts.push({ wp, project: e.config?.name ?? null, entry: e, file: e.file, list: [] });
  }

  const owner = new Map<string, string>();
  const composes = drafts.map((d) => {
    const key = composeKeyOf(d.wp.path, d.project, d.file);
    for (const c of d.list) owner.set(c.id, key);
    const created = d.list.length > 0;
    const config = d.entry?.config ?? null;
    const startBlocked = d.entry?.error
      ? "compose の設定を読めませんでした（下の ⚠ のエラーを直してください）"
      : !d.entry || !d.entry.filesExist
        ? `compose のファイルが見つかりません${d.file ? `（${d.file}）` : ""}。止める・片付けることはできます`
        : null;
    return {
      key,
      worktree_path: d.wp.worktree_path,
      branch: d.wp.branch,
      file: d.file ? relativeApiPath(d.wp.path, d.file) || path.basename(d.file) : null,
      project_name: d.project,
      created,
      services: servicesOf(config, d.list),
      config_error: d.entry?.error ?? null,
      config_changed: created && configChanged(d.entry?.hashes ?? null, d.list),
      shares: [] as DockerShare[],
      start_blocked: startBlocked,
      down_blocked: null as string | null,
    };
  });

  // 同じ組の名前になっている相手（⚠）
  for (const c of composes) {
    if (!c.project_name) continue;
    const wpPath = drafts[composes.indexOf(c)].wp.path;
    for (const [i, other] of composes.entries()) {
      if (other === c || other.project_name !== c.project_name) continue;
      const otherWp = drafts[i].wp;
      if (otherWp.path === wpPath) c.shares.push({ kind: "file", worktree_path: null, branch: null, file: other.file, other: null });
      else if (!c.shares.some((s) => s.kind === "workplace" && s.worktree_path === otherWp.worktree_path && !s.other))
        c.shares.push({ kind: "workplace", worktree_path: otherWp.worktree_path, branch: otherWp.branch, file: null, other: null });
    }
    // ほかのプロジェクトの同じ名前の組
    const foreign = new Set(others.filter((o) => o.project === c.project_name && o.dir).map((o) => path.basename(o.dir ?? "")));
    for (const name of foreign) c.shares.push({ kind: "workplace", worktree_path: null, branch: null, file: null, other: name });
    if (c.shares.some((s) => s.kind === "file")) c.down_blocked = "同じ作業場所のほかの compose と同じ組です。片付けると両方のコンテナが消えるので、ここからは片付けません";
  }

  return {
    composes,
    others: others.filter((o) => o.state === "running").map((o) => ({ name: o.name, ports: parsePorts(o.ports).map((p) => p.host_port) })),
    owner,
  };
}

/**
 * 起動（up）すると作り直される、別の場所のコンテナ（同じ組の名前で、ほかの作業場所・ほかのプロジェクト・同じ作業場所のほかの見出しのもの）。
 * あれば、起動の前に利用者に確かめる
 */
export function sharedVictims(composeKey: string, projectName: string | null, containers: readonly RawContainer[], owner: ReadonlyMap<string, string>): RawContainer[] {
  if (!projectName) return [];
  return containers.filter((c) => c.project === projectName && owner.get(c.id) !== composeKey);
}

/**
 * 同じ組になる起動の確かめの文。相手は札（「本体 | main」「WT | feat-x」）、同じ作業場所のほかの compose ならそのファイル、
 * このプロジェクトの compose のものでなければ「ほかのプロジェクト（フォルダ名）」、compose のフォルダが分からなければコンテナの名前
 */
export function sharedMessage(
  name: string,
  victims: readonly Pick<RawContainer, "id" | "name" | "dir">[],
  self: Pick<DockerCompose, "worktree_path">,
  composeOf: (containerId: string) => Pick<DockerCompose, "worktree_path" | "branch" | "file" | "project_name"> | undefined,
): string {
  const labelOf = (v: Pick<RawContainer, "id" | "name" | "dir">) => {
    const c = composeOf(v.id);
    if (c) return c.worktree_path === self.worktree_path ? `同じ作業場所の ${c.file ?? c.project_name ?? "compose"}` : workplaceText(c.worktree_path, c.branch);
    return v.dir ? `ほかのプロジェクト（${path.basename(v.dir)}）` : v.name;
  };
  const where = [...new Set(victims.map(labelOf))].join("・");
  return `${where}${where.endsWith("）") ? "" : " "}の組と同じ名前（${name}）です。起動すると、そちらのコンテナが作り直されます`;
}

/** ログの画面のコンテナ（数を増やしたサービスは「app#2」、使い捨ては「app · 使い捨て」。作っていないサービスは入れない） */
export function logSourcesOf(compose: Pick<DockerCompose, "services">): DockerLogSource[] {
  return compose.services.flatMap((s) => [
    ...s.containers.map((c) => ({ container: c.id, service: s.name, label: s.containers.length > 1 ? `${s.name}#${c.number}` : s.name, running: c.state === "running" || c.state === "restarting", exit_code: c.exit_code })),
    ...s.oneoffs.map((c) => ({ container: c.id, service: s.name, label: `${s.name} · 使い捨て`, running: c.state === "running", exit_code: c.exit_code })),
  ]);
}
