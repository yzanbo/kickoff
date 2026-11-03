import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./dbOpen.js";
import type { Notify } from "./store/common.js";
import { createGroupStore } from "./store/groups.js";
import { createProjectStore, type ProjectPatch } from "./store/projects.js";
import { createRunStore, type RunFilter, type RunPatch } from "./store/runs.js";
import { createSettingsStore, type SecretKey } from "./store/settings.js";
import type {
  AppSettings,
  NewProject,
  NewRun,
  Project,
  ProjectSummary,
  Run,
  RunEvent,
  RunEventData,
  RunGroup,
  SearchHit,
} from "./types.js";

/**
 * SQLite の永続化層。変更系メソッドは onChange でイベントを通知する
 * （UI やモバイルへのリアルタイム配信はこの通知を起点にする）。
 * 中身は store/ に表ごとに分けてあり、ここは同じ名前で委譲する入口
 */
export class Store {
  readonly db: DatabaseSync;
  private readonly settings;
  private readonly projects;
  private readonly runs;
  private readonly groups;

  constructor(file: string, onChange: Notify = () => {}) {
    this.db = openDatabase(file);
    this.settings = createSettingsStore(this.db, onChange);
    this.projects = createProjectStore(this.db, onChange);
    this.runs = createRunStore(this.db, onChange);
    this.groups = createGroupStore(this.db, onChange, this.runs.get);
  }

  close() {
    this.db.close();
  }

  // ---- 設定（store/settings.ts） ----

  getSettings(): AppSettings {
    return this.settings.get();
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    return this.settings.update(patch);
  }

  /** API キーなどの秘密の値（設定の一覧・画面への配信には含めない） */
  getSecret(key: SecretKey): string | null {
    return this.settings.secret(key);
  }

  setSecret(key: SecretKey, value: string) {
    this.settings.setSecret(key, value);
  }

  // ---- プロジェクト（store/projects.ts） ----

  listProjects(): ProjectSummary[] {
    return this.projects.list();
  }

  findProjectByPath(repoPath: string): Project | undefined {
    return this.projects.findByPath(repoPath);
  }

  getProject(id: number): Project | undefined {
    return this.projects.get(id);
  }

  createProject(input: NewProject): Project {
    return this.projects.create(input);
  }

  updateProject(id: number, patch: ProjectPatch): Project {
    return this.projects.update(id, patch);
  }

  /** サイドバーでのプロジェクトの並び順を ids の順にする */
  reorderProjects(ids: number[]) {
    this.projects.reorder(ids);
  }

  deleteProject(id: number) {
    this.projects.delete(id);
  }

  // ---- 実行（エージェントとの会話セッション。store/runs.ts） ----

  listRuns(filter: RunFilter = {}): Run[] {
    return this.runs.list(filter);
  }

  getRun(id: number): Run | undefined {
    return this.runs.get(id);
  }

  createRun(input: NewRun): Run {
    return this.runs.create(input);
  }

  updateRun(id: number, patch: RunPatch): Run {
    return this.runs.update(id, patch);
  }

  /** チャットを完全に削除する（会話の記録も消える） */
  deleteRun(id: number) {
    this.runs.delete(id);
  }

  /** 未読の印を付ける・外す。最後に動いた時刻（一覧の並び順）は変えない */
  setRunAttention(id: number, attention: boolean): Run {
    return this.runs.setAttention(id, attention);
  }

  /** サイドバーの上に固定する・やめる（最後に動いた時刻（並び順）は変えない） */
  setRunPinned(id: number, pinned: boolean): Run {
    return this.runs.setPinned(id, pinned);
  }

  /** チャットをグループへ移す（null でグループから外す）。並び順が変わらないよう更新日時は進めない */
  setRunGroup(id: number, groupId: number | null): Run {
    return this.runs.setGroup(id, groupId);
  }

  /** 完了したまま days 日たったチャットをアーカイブする（自動のアーカイブ）。アーカイブした数を返す */
  archiveStaleRuns(days: number, now = new Date()): number {
    return this.runs.archiveStale(days, now);
  }

  /** その作業場所（ワークツリー）を使っているチャット */
  runsInWorktree(projectId: number, worktreePath: string): Run[] {
    return this.runs.inWorktree(projectId, worktreePath);
  }

  /** ワークツリーを片付けたあと、そこで作業していたチャットの作業場所を本体に戻す（並び順は変えない） */
  clearRunWorktree(projectId: number, worktreePath: string): void {
    this.runs.clearWorktree(projectId, worktreePath);
  }

  addEvent(runId: number, event: RunEventData): RunEvent {
    return this.runs.addEvent(runId, event);
  }

  /** 会話の記録を、別のチャットへ upToEventId まで写す（時刻もそのまま。分岐したチャット用） */
  copyEvents(fromRunId: number, toRunId: number, upToEventId: number): void {
    this.runs.copyEvents(fromRunId, toRunId, upToEventId);
  }

  /** 会話の記録を、fromEventId から後ろ（fromEventId を含む）すべて消す（巻き戻し用） */
  deleteEventsFrom(runId: number, fromEventId: number): void {
    this.runs.deleteEventsFrom(runId, fromEventId);
  }

  listEvents(runId: number): RunEvent[] {
    return this.runs.listEvents(runId);
  }

  /** チャットのやり取り（自分の発言と AI の返答）をキーワードで検索する。新しい順 */
  searchEvents(query: string, filter: { projectId?: number; runId?: number; limit?: number } = {}): SearchHit[] {
    return this.runs.searchEvents(query, filter);
  }

  /** 起動時の復旧: 前回終了時に動いていた実行を中断扱いにする */
  recoverInterruptedRuns(): number {
    const stale = this.listRuns({ statuses: ["queued", "running", "waiting"], limit: 1000, includeArchived: true });
    for (const run of stale) {
      this.updateRun(run.id, {
        status: "failed",
        error: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
        // まだ見ていないので未読にする
        attention: true,
      });
    }
    return stale.length;
  }

  // ---- チャットのグループ（store/groups.ts） ----

  listGroups(projectId: number): RunGroup[] {
    return this.groups.list(projectId);
  }

  getGroup(id: number): RunGroup | undefined {
    return this.groups.get(id);
  }

  createGroup(projectId: number, name: string): RunGroup {
    return this.groups.create(projectId, name);
  }

  renameGroup(id: number, name: string): RunGroup {
    return this.groups.rename(id, name);
  }

  /** ids の順に並べ直す（ほかのプロジェクトのグループは無視する） */
  reorderGroups(projectId: number, ids: number[]): RunGroup[] {
    return this.groups.reorder(projectId, ids);
  }

  /** グループを消す。中のチャットは消さず、グループなしに戻す */
  deleteGroup(id: number) {
    this.groups.delete(id);
  }
}
