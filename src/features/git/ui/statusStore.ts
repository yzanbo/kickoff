// Git の状態を作業場所ごとに 1 つ持つ店（読む部品が何か所あっても、取りに行くのは 1 回）。部品は useGitStatus（useGitStatus.ts）で読む。
// 取り直す決まりはここに 1 つだけ持つ: 初めて読んだとき・窓に戻ったとき・このプロジェクトのチャットが動いてから 1.5 秒・
// active（変更・履歴のタブを開いている）の部品がある間は 5 秒ごと。リモートの情報も、active になったとき・窓に戻ったとき・3 分ごとに
// 裏で取ってくるよう頼む（POST fetch { auto: true }。前から間がない・操作中なら飛ばすのはコアの鍵。別ウィンドウ・スマホとも共有）
import type { GitStatus } from "@shared/git/types";
import { errorMessage } from "@shared/foundation/errors";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import type { StoreState } from "@/foundation/ui/store/storeTypes";
import { workplaceKey, type WorkplaceRef } from "@/foundation/ui/workplace/workplace";

/** active の間に取り直す間隔（エディタなど、Kickoff の外での変更にも追いつくため） */
const POLL_MS = 5000;
/** active の間に、リモートの情報を取ってくる間隔（開いたとき・窓に戻ったときにも取ってくる） */
const FETCH_MS = 3 * 60_000;
/** チャットが動いたあと、取り直すまで待つ時間（続けて届く知らせをまとめる） */
const CHAT_ACTIVITY_DELAY_MS = 1500;

/** 届いた状態と、届くたびに増える番号（ファイルの一覧・履歴も取り直すため） */
export interface LoadedGitStatus {
  value: GitStatus;
  version: number;
}

/** 状態のほかに出す印 */
export interface GitStatusFlags {
  /** 変わったかもしれないと知ってから、結果が届くまで（タブの数の代わりに更新中の印を出す。一定の間隔の取り直しでは立てない） */
  refreshing: boolean;
  /** 自動のフェッチの途中（帯の「フェッチ」のボタンに回る印を出す） */
  autoFetching: boolean;
  /** 取り直しのボタンのフェッチの失敗（次に読めたら消える） */
  fetchError: string | undefined;
}

const NO_FLAGS: GitStatusFlags = Object.freeze({ refreshing: false, autoFetching: false, fetchError: undefined });

export interface GitStatusDeps {
  load(ref: WorkplaceRef): Promise<GitStatus>;
  /** 自動のフェッチを頼む（飛ばすか・失敗はコアが決め、今の状態を返す） */
  autoFetch(ref: WorkplaceRef): Promise<GitStatus>;
}

interface Watch {
  ref: WorkplaceRef;
  /** 読んでいる部品の数と、そのうち active の数 */
  users: number;
  active: number;
  poll?: ReturnType<typeof setInterval>;
  fetchTimer?: ReturnType<typeof setInterval>;
  chatTimer?: ReturnType<typeof setTimeout>;
  dropTimer?: ReturnType<typeof setTimeout>;
}

export function createGitStatusStore(deps: GitStatusDeps) {
  const watches = new Map<string, Watch>();
  let version = 0;
  const statuses = createKeyedStore<string, LoadedGitStatus>({
    // 取り直すのは読んでいる作業場所だけ（refresh が確かめる）
    load: (key) => deps.load(watches.get(key)!.ref).then((value) => ({ value, version: ++version })),
  });
  const flags = createKeyedStore<string, GitStatusFlags>();
  const flagsOf = (key: string) => flags.get(key).data ?? NO_FLAGS;
  function setFlags(key: string, patch: Partial<GitStatusFlags>) {
    const now = flagsOf(key);
    if (Object.entries(patch).some(([k, v]) => now[k as keyof GitStatusFlags] !== v)) flags.set(key, { ...now, ...patch });
  }

  /** 取り直す（quiet: 更新中の印を立てない。一定の間隔の取り直し） */
  function refresh(key: string, quiet = false): Promise<void> {
    if (!watches.has(key)) return Promise.resolve();
    if (!quiet) setFlags(key, { refreshing: true });
    return statuses.reload(key).then(
      () => setFlags(key, { refreshing: false, fetchError: undefined }),
      () => setFlags(key, { refreshing: false }),
    );
  }

  /** 裏でリモートの情報を取ってきてもらい、返った状態を出す（変わった参照が履歴にも出る。失敗は知らせない） */
  function autoFetch(key: string) {
    const watch = watches.get(key);
    if (!watch) return;
    setFlags(key, { autoFetching: true });
    deps.autoFetch(watch.ref).then(
      (value) => {
        setFlags(key, { autoFetching: false });
        if (watches.get(key) !== watch) return;
        statuses.set(key, { value, version: ++version });
        setFlags(key, { refreshing: false, fetchError: undefined });
      },
      () => setFlags(key, { autoFetching: false }),
    );
  }

  function release(key: string, watch: Watch) {
    if (watch.users > 0 || watch.active > 0) return;
    // 描き直しで外してすぐ付け直す（StrictMode など）間は捨てない
    watch.dropTimer = setTimeout(() => {
      if (watches.get(key) !== watch || watch.users > 0 || watch.active > 0) return;
      clearTimeout(watch.chatTimer);
      watches.delete(key);
      statuses.drop(key);
      flags.drop(key);
    }, 0);
  }

  function entry(ref: WorkplaceRef): [string, Watch] {
    const key = workplaceKey(ref);
    let watch = watches.get(key);
    if (!watch) watches.set(key, (watch = { ref, users: 0, active: 0 }));
    clearTimeout(watch.dropTimer);
    return [key, watch];
  }

  return {
    state: (key: string): StoreState<LoadedGitStatus> => statuses.get(key),
    flags: flagsOf,
    subscribe(key: string, listener: () => void) {
      const offs = [statuses.subscribe(key, listener), flags.subscribe(key, listener)];
      return () => offs.forEach((off) => off());
    },
    /** 読み始める（まだ届いていなければ取りに行く。ほかの部品が読んでいれば、その値をそのまま使う）。やめるときは返り値を呼ぶ */
    watch(ref: WorkplaceRef): () => void {
      const [key, watch] = entry(ref);
      watch.users++;
      const now = statuses.get(key);
      if (!now.loaded && !now.loading) void refresh(key);
      return () => {
        watch.users--;
        release(key, watch);
      };
    },
    /** active の間（変更・履歴のタブを開いている）は一定の間隔で取り直し、リモートの情報も取ってくる */
    activate(ref: WorkplaceRef): () => void {
      const [key, watch] = entry(ref);
      if (++watch.active === 1) {
        watch.poll = setInterval(() => void refresh(key, true), POLL_MS);
        autoFetch(key);
        watch.fetchTimer = setInterval(() => autoFetch(key), FETCH_MS);
      }
      return () => {
        if (--watch.active === 0) {
          clearInterval(watch.poll);
          clearInterval(watch.fetchTimer);
        }
        release(key, watch);
      };
    },
    refresh: (ref: WorkplaceRef) => refresh(workplaceKey(ref)),
    autoFetch: (ref: WorkplaceRef) => autoFetch(workplaceKey(ref)),
    /** 操作のあとの状態をそのまま出す（取り直しを待たない。読み込み中の応答は捨てる） */
    async apply(ref: WorkplaceRef, request: Promise<GitStatus>): Promise<void> {
      const value = await request;
      const key = workplaceKey(ref);
      statuses.set(key, { value, version: ++version });
      setFlags(key, { refreshing: false });
    },
    fetchFailed: (ref: WorkplaceRef, error: unknown) => setFlags(workplaceKey(ref), { fetchError: errorMessage(error) }),
    /** 窓に戻った（読んでいる作業場所を取り直し、active ならリモートの情報も取ってくる） */
    windowFocused() {
      for (const [key, watch] of watches) {
        void refresh(key);
        if (watch.active > 0) autoFetch(key);
      }
    },
    /**
     * このプロジェクトのチャットが動いた（送った・終わった・作業中にツールの結果が届いた = ファイルが変わったかもしれない）。
     * 待っている間も更新中の印を出し、続けて届く知らせは最初の知らせから待つ 1 回にまとめる（届くたびに待ち直すと、ツールが続く間はいつまでも取り直さない）
     */
    chatMoved(projectId: number) {
      for (const [key, watch] of watches) {
        if (watch.ref.projectId !== projectId) continue;
        setFlags(key, { refreshing: true });
        if (watch.chatTimer !== undefined) continue;
        watch.chatTimer = setTimeout(() => {
          watch.chatTimer = undefined;
          void refresh(key);
        }, CHAT_ACTIVITY_DELAY_MS);
      }
    },
  };
}
