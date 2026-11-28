// 新しい版を確かめて入れる仕組み（electron-updater の上の殻。様子の移り変わりは updateModel.ts）。
// 起動して少しあとと 1 時間ごとに確かめ、見つけたら裏でダウンロードする。窓・通知は出さず、様子を画面へ知らせる（⚙ の印と設定の帯）。
// ［更新して開き直す］で作業中のチャットがあれば、なくなるまで待ってから入れる（数え方は install-app と同じ /api/status の agents.running）
import type { Clock, TimerHandle } from "@/foundation/core/clock";
import type { UpdatePrefs, UpdateState } from "@shared/updates/types";
import { blocksCheck, nextUpdateState, type UpdateEvent } from "./updateModel";

/** 起動してから最初に確かめるまで（起動の重さと重ねない） */
export const FIRST_CHECK_MS = 30_000;
/** 確かめる間隔 */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** 手で確かめたとき「確認中…」を出しておく短さ（すぐ消えると、確かめたのか分からない） */
export const MIN_CHECKING_MS = 500;

/** electron-updater の autoUpdater のうち使う所（テストは偽物を渡す） */
export interface UpdaterPort {
  /** 版の一覧を読む（新しい版があれば updateInfo の版。動かない版では null） */
  checkForUpdates(): Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } } | null>;
  downloadUpdate(): Promise<unknown>;
  /** 入れて開き直す（Squirrel が印鑑を確かめ、違えば error が届いてアプリは終わらない） */
  quitAndInstall(): void;
  on(event: "download-progress", fn: (progress: { percent: number }) => void): unknown;
  on(event: "update-downloaded", fn: (info: { version: string }) => void): unknown;
  on(event: "error", fn: (error: Error) => void): unknown;
}

export interface UpdateControllerDeps {
  port: UpdaterPort;
  clock: Pick<Clock, "now" | "setTimeout" | "clearTimeout" | "sleep">;
  /** 更新の設定（読めなければ null） */
  prefs(): Promise<UpdatePrefs | null>;
  /** いま作業中のチャットの数と、その変わり目（やめるときは返り値を呼ぶ） */
  running(): number;
  onRunning(fn: (running: number) => void): () => void;
  publish(state: UpdateState): void;
  log(message: string): void;
}

export function createUpdateController(deps: UpdateControllerDeps) {
  let state: UpdateState = { kind: "idle" };
  let timer: TimerHandle | null = null;
  let checking: Promise<void> | null = null;
  let offRunning: (() => void) | null = null;

  const apply = (event: UpdateEvent) => {
    const next = nextUpdateState(state, event);
    if (next === state) return;
    const startDownload = next.kind === "downloading" && state.kind !== "downloading";
    state = next;
    deps.publish(state);
    if (startDownload) void download();
    if (state.kind === "installing") install();
  };

  async function download() {
    try {
      await deps.port.downloadUpdate();
    } catch (e) {
      deps.log(`新しい版をダウンロードできませんでした: ${(e as Error).message}`);
      apply({ type: "downloadFailed" });
    }
  }

  function install() {
    offRunning?.();
    offRunning = null;
    deps.log(`新しい版 ${state.kind === "installing" ? state.version : ""} を入れて開き直します`);
    deps.port.quitAndInstall();
  }

  async function runCheck(manual: boolean) {
    const startedAt = deps.clock.now();
    const prefs = await deps.prefs().catch(() => null);
    // 自動の確かめは、設定を読めない（コアが動いていない）・切ってあるときは見送る
    if (!manual && !prefs?.autoCheck) return;
    apply({ type: "checkStarted", manual });
    let event: UpdateEvent;
    try {
      const result = await deps.port.checkForUpdates();
      event = result?.isUpdateAvailable ? { type: "found", version: result.updateInfo.version, manual, skipped: prefs?.skippedVersion ?? null } : { type: "notFound", manual };
    } catch (e) {
      deps.log(`新しい版を確かめられませんでした: ${(e as Error).message}`);
      event = { type: "checkFailed", manual };
    }
    if (manual) await deps.clock.sleep(Math.max(0, MIN_CHECKING_MS - (deps.clock.now() - startedAt)));
    apply(event);
  }

  /** 確かめる（同時には 1 つ。ダウンロード中・入れるのを待っている間は確かめない） */
  function check(manual: boolean): Promise<void> {
    if (blocksCheck(state)) return Promise.resolve();
    checking ??= runCheck(manual).finally(() => (checking = null));
    return checking;
  }

  const schedule = (ms: number) => {
    timer = deps.clock.setTimeout(() => {
      void check(false);
      schedule(CHECK_INTERVAL_MS);
    }, ms);
  };

  deps.port.on("download-progress", (p) => apply({ type: "progress", percent: p.percent }));
  deps.port.on("update-downloaded", (info) => apply({ type: "downloaded", version: info.version }));
  // 確かめ・ダウンロードの失敗は呼び出しの失敗で受ける。ここで受けるのは、入れるときの Squirrel の確かめの失敗（にせもの・置き場所に書けない）
  deps.port.on("error", (e) => {
    deps.log(`更新の仕組みが失敗しました: ${e.message}`);
    if (state.kind === "installing") apply({ type: "installFailed" });
  });

  return {
    state: () => state,
    start() {
      if (timer === null) schedule(FIRST_CHECK_MS);
    },
    check,
    /** ［更新して開き直す］: 作業中のチャットがあれば、なくなったら入れる */
    requestInstall() {
      if (state.kind !== "ready") return;
      const running = deps.running();
      if (running > 0) offRunning = deps.onRunning((n) => apply({ type: "runningChanged", running: n }));
      apply({ type: "installRequested", running });
    },
    cancelInstall() {
      offRunning?.();
      offRunning = null;
      apply({ type: "installCancelled" });
    },
    skip: () => apply({ type: "skipped" }),
    stop() {
      deps.clock.clearTimeout(timer);
      timer = null;
      offRunning?.();
    },
  };
}

export type UpdateController = ReturnType<typeof createUpdateController>;
