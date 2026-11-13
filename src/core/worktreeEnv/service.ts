// ワークツリーの実行環境（メモの仕様書「ワークツリーの実行環境」の段階 1）: ワークツリーを作ったときに、ポートの帯と Docker の組の名前を割り当て、
// DB に覚え、Git で管理していないファイル（写した .env と .kickoff/compose.worktree.yaml）に書く。起動のたびには調べない
import fs from "node:fs/promises";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import { WORKTREE_BAND_SIZE, worktreeSlotLabel, type GitWorktree, type Project, type WorktreeComposeName, type WorktreeEnv } from "@shared/types";
import type { Store } from "../db/store.js";
import type { StoredWorktreeEnv } from "../db/worktreeEnvs.js";
import { findComposeFiles, upFilesFor } from "../docker/compose.js";
import { STANDARD_COMPOSE_NAMES } from "../docker/parse.js";
import type { DockerService } from "../docker/service.js";
import { isInside } from "../system/paths.js";
import { assignSlots, pickBand, type DockerSlotWant } from "./bands.js";
import { composePortsOf, overrideYaml, portSpec } from "./composeOverride.js";
import { commentOutKeys, rewriteEnvPorts, withKickoffBlock } from "./envRewrite.js";
import { KICKOFF_DIR, OVERRIDE_FILE, addGitExclude, devServerIssue, envFilesIn, exists, isIgnored, isTracked } from "./files.js";
import { browserHostOf, composeProjectNameOf } from "./names.js";
import type { EnvSetupPromptInput } from "./setupPrompt.js";

/** compose のフォルダ（プロジェクトのフォルダからの相対。直下は ""）ごとの、-f に渡すファイル */
interface ComposeFolder {
  dir: string;
  /** ワークツリーの中のファイル（compose が読む並び。Kickoff の上書きファイルは除く） */
  files: string[];
}

const isStandard = (file: string) => (STANDARD_COMPOSE_NAMES as readonly string[]).includes(path.basename(file));
const rel = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** 画面に返す形（アプリの URL を足す） */
export function toApiEnv(env: StoredWorktreeEnv): WorktreeEnv {
  const { path: _path, project_id: _project, ...rest } = env;
  return { ...rest, app_url: env.band !== null && env.host ? `http://${env.host}:${env.band}` : null };
}

export class WorktreeEnvService {
  constructor(
    private readonly store: Store,
    private readonly docker: DockerService,
  ) {}

  /**
   * 作ったばかりのワークツリーを整える（⓪ .env を写す → 帯 → ① 組の名前・② Docker のポート・③ 接続先）。
   * 失敗してもワークツリーの作成は失敗させず、分けられない理由として覚える
   */
  async prepare(project: Project, worktree: GitWorktree): Promise<void> {
    if (worktree.main || this.store.worktreeEnvs.get(worktree.path)) return;
    let env: StoredWorktreeEnv;
    try {
      env = await this.build(project, worktree);
    } catch (e) {
      console.warn("[worktree-env] ワークツリーの実行環境を整えられませんでした", e);
      env = this.blocked(project, worktree, `ワークツリーの実行環境を整えられませんでした: ${errorMessage(e)}`);
    }
    this.store.worktreeEnvs.put(env);
  }

  /**
   * ［AI で整える］の下ごしらえ: この機能より前に作ったワークツリー（覚えがない）なら、先に手順を流す（.env を写す・帯・①〜③）。
   * AI に渡す材料（割り当て・ほかのワークツリーの帯）を返す
   */
  async setupInput(project: Project, worktree: GitWorktree): Promise<EnvSetupPromptInput> {
    await this.prepare(project, worktree);
    const env = this.store.worktreeEnvs.get(worktree.path)!;
    const { path: _path, project_id: _project, ...rest } = env;
    return {
      label: worktree.branch ?? path.basename(worktree.root),
      path: worktree.path,
      mainPath: project.repo_path,
      env: rest,
      otherBands: [...this.store.worktreeEnvs.takenBands(worktree.path)].sort((a, b) => a - b),
    };
  }

  private blocked(project: Project, worktree: GitWorktree, reason: string, issues: string[] = []): StoredWorktreeEnv {
    return { path: worktree.path, project_id: project.id, band: null, host: null, slots: [], compose_names: [], rewritten: [], issues, blocked: reason };
  }

  private async build(project: Project, worktree: GitWorktree): Promise<StoredWorktreeEnv> {
    const main = project.repo_path;
    const here = worktree.path;
    const issues: string[] = [];
    const folders = this.composeFolders(here, issues);
    const envDirs = [...new Set(["", ...folders.map((f) => f.dir)])];

    // ⓪ 本体の Git で無視している .env たちを写す（Git で管理している .env には書かない）
    const written: string[] = [];
    for (const dir of envDirs) {
      for (const name of [...new Set([...(await envFilesIn(path.join(main, dir))), ...(await envFilesIn(path.join(here, dir)))])]) {
        const file = rel(dir, name);
        if (await isTracked(here, file)) return this.blocked(project, worktree, `このプロジェクトは .env を Git で管理しているので、ポートを分けられません（${file}）`);
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
    // compose のフォルダに .env がなければ作る（Git で無視している場所だけ）
    for (const f of folders) {
      const file = rel(f.dir, ".env");
      if (written.includes(file)) continue;
      if (!(await isIgnored(here, file))) return this.blocked(project, worktree, `${file} を Git で無視していないので、ポートを分けられません`, issues);
      written.push(file);
    }

    const band = await this.pickBand(here);
    if (band === null) return this.blocked(project, worktree, "ポートの帯を使い切りました。使っていないワークツリーを消してください", issues);

    // ①② compose のフォルダごとに、組の名前と公開ポート
    const branch = worktree.branch ?? path.basename(worktree.root);
    const names: WorktreeComposeName[] = [];
    const wants: DockerSlotWant[] = [];
    const portsOf = new Map<string, ReturnType<typeof composePortsOf>>();
    for (const f of folders) {
      const read = await this.docker.readCompose(f.files);
      if (!read.doc) {
        issues.push(`compose の設定を読めませんでした（${rel(f.dir, path.basename(f.files[0]))}）: ${read.error ?? "docker が見つかりません"}`);
        continue;
      }
      const mainFile = path.join(main, path.relative(here, f.files[0]));
      const mainRead = (await exists(mainFile)) ? await this.docker.readCompose(upFilesFor(mainFile).filter((p) => !p.endsWith(OVERRIDE_FILE))) : null;
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
    const { slots, overflow } = assignSlots(band, [], wants);
    if (overflow.length) issues.push(`公開ポートが多く、帯（${WORKTREE_BAND_SIZE} 個）に収まらないものがあります: ${overflow.map((w) => rel(w.compose_dir ?? "", w.service ?? "")).join(", ")}`);

    for (const f of folders) {
      const ports = portsOf.get(f.dir);
      if (!ports) continue;
      const slotFor = (service: string, target: number, protocol: string) => slots.find((s) => s.compose_dir === f.dir && s.service === service && s.target === target && s.protocol === protocol)?.port ?? null;
      const services = [...ports].map(([name, list]) => ({ name, ports: list.map((p) => portSpec(p, p.published === null ? null : slotFor(name, p.target, p.protocol))) }));
      await fs.mkdir(path.join(here, f.dir, KICKOFF_DIR), { recursive: true });
      await fs.writeFile(path.join(here, f.dir, OVERRIDE_FILE), overrideYaml(services));
    }
    if (folders.length) await addGitExclude(here, `${KICKOFF_DIR}/`);

    // ③ 接続先（URL の中のポートと …_PORT）を書き換え、.env の後ろに Kickoff の区切りを足す
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

    const dev = await devServerIssue(here);
    if (dev) issues.push(dev);
    return { path: here, project_id: project.id, band, host: browserHostOf(branch), slots, compose_names: names, rewritten, issues, blocked: null };
  }

  /** compose のフォルダ（直下の別名の compose は、自分の name: を持つと直下の .env の名前とまとまるので知らせるだけ） */
  private composeFolders(here: string, issues: string[]): ComposeFolder[] {
    const byDir = new Map<string, string>();
    for (const file of findComposeFiles(here)) {
      const dir = path.relative(here, path.dirname(file));
      if (!isStandard(file)) {
        issues.push(`直下の別名の compose（${path.basename(file)}）は、-f で指定するとポートが本体と同じままです`);
        continue;
      }
      if (!byDir.has(dir)) byDir.set(dir, file);
    }
    return [...byDir].map(([dir, file]) => ({ dir, files: upFilesFor(file).filter((p) => !p.endsWith(OVERRIDE_FILE)) }));
  }

  /** 空いている帯（ほかのワークツリーに渡してある帯と、いま待ち受けている番号がある帯は飛ばす。待っているソケットを調べられなければ DB だけで選ぶ） */
  private async pickBand(except: string): Promise<number | null> {
    const listening = await this.docker.ports.probe.listeningSockets().then(
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
        await this.docker.cli.run(["compose", "-p", name, "down", "-v", "--remove-orphans"], { cwd: "/", timeout: 120_000 }).catch((e: unknown) => failed.push(`${name}: ${errorMessage(e)}`));
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
