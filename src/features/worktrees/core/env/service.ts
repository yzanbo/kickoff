// ワークツリーの実行環境: ワークツリーを作ったときに、ポートの帯と Docker の組の名前を割り当て、
// DB に覚え、Git で管理していないファイル（写した .env と .kickoff/compose.worktree.yaml）に書く。起動のたびには調べない
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/foundation/errors";
import type { GitWorktree } from "@shared/foundation/workplace";
import type { Project } from "@shared/projects/types";
import { WORKTREE_BAND_SIZE, worktreeSlotLabel, type WorktreeComposeName, type WorktreeEnv, type WorktreePortSlot } from "@shared/worktrees/envTypes";
import type { WorktreeStores } from "@/features/worktrees/core/db/stores";
import type { StoredWorktreeEnv } from "@/features/worktrees/core/db/worktreeEnvs";
import type { ComposeReader, DockerApi } from "@/features/docker/core/index";
import { isInside } from "@/foundation/core/system/paths";
import { isIgnored, isTracked } from "@/foundation/core/workplace/reads";
import { assignSlots, pickBand, type DockerSlotWant } from "./bands";
import { composePortsOf, overrideYaml, portSpec } from "./composeOverride";
import { commentOutKeys, rewriteEnvPorts, withKickoffBlock } from "./envRewrite";
import { KICKOFF_DIR, OVERRIDE_FILE, addGitExclude, devServerIssue, envFilesIn, exists } from "./files";
import { browserHostOf, composeProjectNameOf } from "./names";
import type { EnvSetupPromptInput } from "./setupPrompt";

/** compose のフォルダ（プロジェクトのフォルダからの相対。直下は ""）ごとの、-f に渡すファイル */
interface ComposeFolder {
  dir: string;
  /** ワークツリーの中のファイル（compose が読む並び。Kickoff の上書きファイルは除く） */
  files: string[];
}

/** 分けられない理由（覚えて画面に出す。issues はそこまでに分かった知らせ） */
interface Blocked {
  blocked: string;
  issues: string[];
}

/** compose のフォルダごとの公開ポート */
type PortsOf = Map<string, ReturnType<typeof composePortsOf>>;

const rel = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** 覚えた形から、作業場所の欄（path・project_id）を外したもの */
function envFields(env: StoredWorktreeEnv) {
  const { path: _path, project_id: _project, ...rest } = env;
  return rest;
}

/** 画面に返す形（アプリの URL を足す） */
function toApiEnv(env: StoredWorktreeEnv): WorktreeEnv {
  return { ...envFields(env), app_url: env.band !== null && env.host ? `http://${env.host}:${env.band}` : null };
}

/**
 * ⓪ 本体の Git で無視している .env たちを写す（Git で管理している .env があれば分けない）。compose のフォルダに .env がなければ作る（Git で無視している場所だけ）。
 * 写した（書く）.env の一覧を返す
 */
async function copyEnvFiles(main: string, here: string, folders: ComposeFolder[], issues: string[]): Promise<{ written: string[] } | Blocked> {
  const written: string[] = [];
  for (const dir of [...new Set(["", ...folders.map((f) => f.dir)])]) {
    for (const name of [...new Set([...(await envFilesIn(path.join(main, dir))), ...(await envFilesIn(path.join(here, dir)))])]) {
      const file = rel(dir, name);
      if (await isTracked(here, file)) return { blocked: `このプロジェクトは .env を Git で管理しているので、ポートを分けられません（${file}）`, issues: [] };
      if (await exists(path.join(here, file))) {
        written.push(file);
        continue;
      }
      if (!(await isIgnored(main, file))) {
        issues.push(`${file} は Git で無視していないので、ワークツリーに写していません`);
        continue;
      }
      await fs.copyFile(path.join(main, file), path.join(here, file));
      written.push(file);
    }
  }
  for (const f of folders) {
    const file = rel(f.dir, ".env");
    if (written.includes(file)) continue;
    if (!(await isIgnored(here, file))) return { blocked: `${file} を Git で無視していないので、ポートを分けられません`, issues };
    written.push(file);
  }
  return { written };
}

/** ①② compose のフォルダごとに、組の名前と、帯の番号にしたい公開ポート（本体の番号を original に） */
async function composeWants(folders: ComposeFolder[], main: string, here: string, branch: string, compose: ComposeReader, issues: string[]) {
  const names: WorktreeComposeName[] = [];
  const wants: DockerSlotWant[] = [];
  const portsOf: PortsOf = new Map();
  for (const f of folders) {
    const read = await compose.read(f.files);
    if (!read.doc) {
      issues.push(`compose の設定を読めませんでした（${rel(f.dir, path.basename(f.files[0]))}）: ${read.error ?? "docker が見つかりません"}`);
      continue;
    }
    const mainFile = path.join(main, path.relative(here, f.files[0]));
    const mainRead = (await exists(mainFile)) ? await compose.read(compose.upFilesFor(mainFile).filter((p) => !p.endsWith(OVERRIDE_FILE))) : null;
    const mainPorts = composePortsOf(mainRead?.doc);
    const ports = composePortsOf(read.doc);
    portsOf.set(f.dir, ports);
    names.push({ dir: f.dir, name: composeProjectNameOf(mainRead?.config?.name ?? path.basename(path.join(main, f.dir)), branch) });
    for (const [service, list] of ports) {
      for (const p of list) {
        if (p.published_raw !== null && p.published === null) issues.push(`${rel(f.dir, service)} のポート ${p.published_raw} は範囲なので、帯の番号にしていません`);
        if (p.published === null) continue;
        const original = mainPorts.get(service)?.find((m) => m.target === p.target && m.protocol === p.protocol)?.published ?? p.published;
        wants.push({ compose_dir: f.dir, service, target: p.target, protocol: p.protocol, original });
      }
    }
  }
  return { names, wants, portsOf };
}

/** compose のフォルダごとの上書きファイル（.kickoff/compose.worktree.yaml。公開ポートを帯の番号に）を書き、.kickoff/ を Git に無視させる */
async function writeOverrides(here: string, folders: ComposeFolder[], slots: WorktreePortSlot[], portsOf: PortsOf): Promise<void> {
  for (const f of folders) {
    const ports = portsOf.get(f.dir);
    if (!ports) continue;
    const slotFor = (service: string, target: number, protocol: string) => slots.find((s) => s.compose_dir === f.dir && s.service === service && s.target === target && s.protocol === protocol)?.port ?? null;
    const services = [...ports].map(([name, list]) => ({ name, ports: list.map((p) => portSpec(p, p.published === null ? null : slotFor(name, p.target, p.protocol))) }));
    await fs.mkdir(path.join(here, f.dir, KICKOFF_DIR), { recursive: true });
    await fs.writeFile(path.join(here, f.dir, OVERRIDE_FILE), overrideYaml(services));
  }
  if (folders.length) await addGitExclude(here, `${KICKOFF_DIR}/`);
}

/** ③ 接続先（URL の中のポートと …_PORT）を書き換え、.env の後ろに Kickoff の区切り（帯・組の名前・COMPOSE_FILE）を足す。書き換えた変数を返す */
async function rewriteEnvFiles(here: string, written: string[], band: number, slots: WorktreePortSlot[], names: WorktreeComposeName[], folders: ComposeFolder[], issues: string[]): Promise<string[]> {
  const portMap = new Map(slots.filter((s) => s.kind === "docker" && s.original !== null).map((s) => [s.original!, s.port]));
  const rewritten: string[] = [];
  const header = `ワークツリーの実行環境。帯 ${band}〜${band + WORKTREE_BAND_SIZE - 1}`;
  for (const file of written) {
    const dir = path.dirname(file) === "." ? "" : path.dirname(file);
    const abs = path.join(here, file);
    const before = await fs.readFile(abs, "utf8").catch(() => "");
    const r = rewriteEnvPorts(before, portMap);
    rewritten.push(...r.rewritten.map((k) => `${file} の ${k}`));
    for (const k of r.leftovers) issues.push(`変わった形の接続先があります: ${file} の ${k}`);
    for (const k of r.localUrls) issues.push(`ポートを書き換えていない URL があります（アプリ自身の URL・ログインの戻り先なら分けられません）: ${file} の ${k}`);
    let text = r.text;
    if (path.basename(file) !== ".env") {
      if (text !== before) await fs.writeFile(abs, text);
      continue;
    }
    const lines = [`# ${slots.map(worktreeSlotLabel).join(" ／ ")}`];
    if (r.rewritten.length) lines.push(`# 書き換えた変数: ${r.rewritten.join(", ")}`);
    const name = names.find((n) => n.dir === dir);
    const folder = folders.find((f) => f.dir === dir);
    if (name && folder) {
      const prev = commentOutKeys(text, ["COMPOSE_PROJECT_NAME", "COMPOSE_FILE"]);
      text = prev.text;
      const sep = /^\s*COMPOSE_PATH_SEPARATOR\s*=\s*(\S+)/m.exec(text)?.[1] ?? ":";
      const list = (prev.values.get("COMPOSE_FILE")?.split(sep).filter(Boolean) ?? folder.files.map((p) => path.relative(path.join(here, dir), p))).filter((p) => p !== OVERRIDE_FILE);
      lines.push(`COMPOSE_PROJECT_NAME=${name.name}`, `COMPOSE_FILE=${[...list, OVERRIDE_FILE].join(sep)}`);
    }
    await fs.writeFile(abs, withKickoffBlock(text, header, lines));
  }
  return rewritten;
}

export class WorktreeEnvService {
  constructor(
    private readonly store: Pick<WorktreeStores, "worktreeEnvs">,
    private readonly docker: Pick<DockerApi, "compose" | "portProbe">,
  ) {}

  /**
   * 作ったばかりのワークツリーを整える（⓪ .env を写す → 帯 → ① 組の名前・② Docker のポート・③ 接続先）。
   * 失敗してもワークツリーの作成は失敗させず、分けられない理由として覚える
   */
  async prepare(project: Project, worktree: GitWorktree): Promise<void> {
    if (worktree.main || this.store.worktreeEnvs.get(worktree.path)) return;
    let env: StoredWorktreeEnv | Blocked;
    try {
      env = await this.build(project, worktree);
    } catch (e) {
      console.warn("[worktree-env] ワークツリーの実行環境を整えられませんでした", e);
      env = { blocked: `ワークツリーの実行環境を整えられませんでした: ${errorMessage(e)}`, issues: [] };
    }
    this.store.worktreeEnvs.put("path" in env ? env : { path: worktree.path, project_id: project.id, band: null, host: null, slots: [], compose_names: [], rewritten: [], issues: env.issues, blocked: env.blocked });
  }

  /**
   * ［AI で整える］の下ごしらえ: 覚えのないワークツリー（Kickoff の外で作ったものなど）なら、先に手順を流す（.env を写す・帯・①〜③）。
   * AI に渡す材料（割り当て・ほかのワークツリーの帯）を返す
   */
  async setupInput(project: Project, worktree: GitWorktree): Promise<EnvSetupPromptInput> {
    await this.prepare(project, worktree);
    return {
      label: worktree.branch ?? path.basename(worktree.root),
      path: worktree.path,
      mainPath: project.repo_path,
      env: envFields(this.store.worktreeEnvs.get(worktree.path)!),
      otherBands: [...this.store.worktreeEnvs.takenBands(worktree.path)].sort((a, b) => a - b),
    };
  }

  /** 4 段の並び（.env を写す → 帯 → compose に聞く → 上書きファイル → 接続先の書き換え）。分けられなければ Blocked */
  private async build(project: Project, worktree: GitWorktree): Promise<StoredWorktreeEnv | Blocked> {
    const main = project.repo_path;
    const here = worktree.path;
    const issues: string[] = [];
    const folders = this.composeFolders(here, issues);
    const copied = await copyEnvFiles(main, here, folders, issues);
    if ("blocked" in copied) return copied;
    const band = await this.pickBand(here);
    if (band === null) return { blocked: "ポートの帯を使い切りました。使っていないワークツリーを消してください", issues };
    const branch = worktree.branch ?? path.basename(worktree.root);
    const { names, wants, portsOf } = await composeWants(folders, main, here, branch, this.docker.compose, issues);
    const { slots, overflow } = assignSlots(band, [], wants);
    if (overflow.length) issues.push(`公開ポートが多く、帯（${WORKTREE_BAND_SIZE} 個）に収まらないものがあります: ${overflow.map((w) => rel(w.compose_dir ?? "", w.service ?? "")).join(", ")}`);
    await writeOverrides(here, folders, slots, portsOf);
    const rewritten = await rewriteEnvFiles(here, copied.written, band, slots, names, folders, issues);
    const dev = await devServerIssue(here);
    if (dev) issues.push(dev);
    return { path: here, project_id: project.id, band, host: browserHostOf(branch), slots, compose_names: names, rewritten, issues, blocked: null };
  }

  /** compose のフォルダ（直下の別名の compose は、自分の name: を持つと直下の .env の名前とまとまるので知らせるだけ） */
  private composeFolders(here: string, issues: string[]): ComposeFolder[] {
    const { compose } = this.docker;
    const byDir = new Map<string, string>();
    for (const file of compose.findFiles(here)) {
      const dir = path.relative(here, path.dirname(file));
      if (!compose.isStandardName(file)) {
        issues.push(`直下の別名の compose（${path.basename(file)}）は、-f で指定するとポートが本体と同じままです`);
        continue;
      }
      if (!byDir.has(dir)) byDir.set(dir, file);
    }
    return [...byDir].map(([dir, file]) => ({ dir, files: compose.upFilesFor(file).filter((p) => !p.endsWith(OVERRIDE_FILE)) }));
  }

  /** 空いている帯（ほかのワークツリーに渡してある帯と、いま待ち受けている番号がある帯は飛ばす。待っているソケットを調べられなければ DB だけで選ぶ） */
  private async pickBand(except: string): Promise<number | null> {
    const listening = await this.docker.portProbe.listeningSockets().then(
      (sockets) => sockets.map((s) => s.port),
      () => [],
    );
    return pickBand(this.store.worktreeEnvs.takenBands(except), listening);
  }

  /** プロジェクトのワークツリーの一覧に env を付ける（一覧にないワークツリーの覚えは消して帯を空ける。アプリの外で消されたもの） */
  attach(projectId: number, worktrees: GitWorktree[]): GitWorktree[] {
    const paths = new Set(worktrees.map((w) => w.path));
    const envs = new Map(this.store.worktreeEnvs.list(projectId).map((e) => [e.path, e]));
    for (const p of envs.keys()) if (!paths.has(p)) this.store.worktreeEnvs.remove(p);
    return worktrees.map((w) => {
      const env = envs.get(w.path);
      return { ...w, env: env ? toApiEnv(env) : null };
    });
  }

  /**
   * ワークツリーを消すとき: downVolumes なら、Kickoff が割り当てた組を docker compose down -v で消す（コンテナとデータ）。そのあと帯を空ける。
   * 消せなかった組の文を返す
   */
  async release(worktreePath: string, { downVolumes }: { downVolumes: boolean }): Promise<string[]> {
    const env = this.store.worktreeEnvs.get(worktreePath);
    if (!env) return [];
    const failed: string[] = [];
    if (downVolumes) {
      for (const { name } of env.compose_names) {
        await this.docker.compose.down(name, { volumes: true, cwd: "/" }).catch((e: unknown) => failed.push(`${name}: ${errorMessage(e)}`));
      }
    }
    this.store.worktreeEnvs.remove(worktreePath);
    return failed;
  }

  /** フォルダ（ターミナル・チャットの作業場所）が帯を持つワークツリーの中なら、渡す環境変数（PORT=帯+00） */
  envFor(dir: string): Record<string, string> {
    const env = this.store.worktreeEnvs.list().find((e) => e.band !== null && isInside(e.path, dir));
    return env ? { PORT: String(env.band) } : {};
  }
}
