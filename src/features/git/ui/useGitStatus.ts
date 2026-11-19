import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { GitConflictResolution, GitOperationAction, GitStatus } from "@shared/types";
import { api } from "@/foundation/ui/api";
import { errorMessage } from "@shared/foundation/errors";
import { useServerEvent } from "@/foundation/ui/api/events";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { useGitTarget } from "@/foundation/ui/workplace/worktreeContext";
import { gitAutoFetch, runGitOperation } from "./gitAutoFetch";

/** 変更のタブを開いている間に取り直す間隔（エディタなど、Kickoff の外での変更にも追いつくため） */
const POLL_MS = 5000;
/** 変更・履歴のタブを開いている間に、リモートの情報を取ってくる間隔（VS Code の自動フェッチと同じ考え方。開いたとき・窓に戻ったときにも取ってくる） */
const FETCH_MS = 3 * 60_000;
/** チャットが動いたあと、取り直すまで待つ時間（続けて届く知らせをまとめる） */
const CHAT_ACTIVITY_DELAY_MS = 1500;

/**
 * プロジェクトのフォルダの Git の状態。開いたとき・ウィンドウに戻ってきたとき・このプロジェクトのチャットが動いたとき（作業中のツールの結果も）に取り直す。
 * active（変更・履歴のタブを開いている）の間は、一定の間隔でも取り直す。リモートの情報も、開いたとき・窓に戻ったとき・一定の間隔で
 * 裏で取ってくる（自動のフェッチ。間を空ける・押した操作とぶつけないのは gitAutoFetch。失敗は知らせない）。count はタブのバッジに出す変更のあるファイルの数。
 * worktree は作業場所（ワークツリーのフォルダ。省略なら本体）
 */
export function useGitStatus(projectId: number, active: boolean, worktree?: string) {
  const { target, key } = useGitTarget(projectId, worktree);
  const [status, setStatus] = useState<{ key: string; value: GitStatus }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  // 変わったかもしれないと知ってから（開いた・ウィンドウに戻った・チャットが動いた・取り直しのボタン）、結果が届くまで（タブの数の代わりに更新中の印を出す）。
  // 一定の間隔の取り直しでは立てない（5 秒ごとに印がちらつくため）
  const [refreshing, setRefreshing] = useState(false);
  // 取り直すたびに増やす（差分も取り直すため）。古い応答で上書きしないためにも使う
  const [version, setVersion] = useState(0);
  const latest = useRef(0);
  // 自動のフェッチの途中（帯の「フェッチ」のボタンに回る印を出す）
  const [autoFetching, setAutoFetching] = useState(false);

  // 取り直す関数は作業場所が変わったときだけ作り直す（target は作業場所ごとに同じもの）
  const refresh = useCallback(
    async (quiet = false) => {
      const request = ++latest.current;
      setLoading(true);
      if (!quiet) setRefreshing(true);
      await api.gitStatus(target).then(
        (value) => {
          if (request !== latest.current) return;
          setStatus({ key, value });
          setVersion((v) => v + 1);
          setError(undefined);
        },
        (e: unknown) => {
          if (request === latest.current) setError(errorMessage(e));
        },
      );
      if (request === latest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key, target],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(true), POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  /** 裏でリモートの情報を取ってきて、取ってきたら取り直す（変わった参照が履歴にも出る） */
  const autoFetch = () => {
    void gitAutoFetch
      .fetch(String(projectId), async () => {
        setAutoFetching(true);
        await api.gitFetch(target).finally(() => setAutoFetching(false));
      })
      .then((ran) => {
        if (ran) void refresh(true);
      });
  };
  // 開いている間（と作業場所を替えたとき）に始め、一定の間隔で取ってくる
  const autoFetchNow = useEffectEvent(() => autoFetch());
  useEffect(() => {
    if (!active) return;
    autoFetchNow();
    const timer = setInterval(() => autoFetchNow(), FETCH_MS);
    return () => clearInterval(timer);
  }, [active, key]);

  useWindowEvent("focus", () => {
    void refresh();
    if (active) autoFetch();
  });

  const chatActivityTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useServerEvent((e) => {
    // チャットが動いた（送った・終わった）か、作業中にツールの結果が届いた（ファイルを変えたかもしれない）。
    // 作業中はチャットの行が変わらないので、ツールの結果も見ないと、差分が作業の終わりまで追いつかない
    const moved = e.type === "chat" ? e.chat.project_id === projectId : e.type === "chat_event" && e.project_id === projectId && e.event.type === "tool_result";
    if (!moved) return;
    // 待っている間も更新中の印を出す（チャットが動いた = ファイルが変わったかもしれない）
    setRefreshing(true);
    // 続けて届く知らせは、最初の知らせから待つ 1 回にまとめる（届くたびに待ち直すと、ツールが続く間はいつまでも取り直さない）
    if (chatActivityTimer.current !== undefined) return;
    chatActivityTimer.current = setTimeout(() => {
      chatActivityTimer.current = undefined;
      void refresh();
    }, CHAT_ACTIVITY_DELAY_MS);
  });
  useEffect(() => () => clearTimeout(chatActivityTimer.current), []);

  /** 操作のあとの状態をそのまま出す（取り直しを待たない） */
  const apply = async (request: Promise<GitStatus>) => {
    const value = await request;
    latest.current++;
    setLoading(false);
    setRefreshing(false);
    setStatus({ key, value });
    setVersion((v) => v + 1);
  };
  /** ステージ・ステージの取り消し・元に戻す */
  const act = (action: "stage" | "unstage" | "discard", paths: string[]) => apply(api.gitAction(target, action, paths));
  /** コミット（amend は直前のコミットに足して書き直す「コミット (修正)」） */
  const commit = (message: string, amend = false) => apply(api.gitCommit(target, message, amend));
  // リモートとやり取りする操作は、自動のフェッチの途中なら終わるのを待ってから（runGitOperation）
  const push = () => apply(runGitOperation(projectId, () => api.gitPush(target)));
  const pull = () => apply(runGitOperation(projectId, () => api.gitPull(target)));
  /** リモートの情報を取ってきてから取り直す（遅れている数を出すため。取り直しのボタンで使う） */
  const fetchRemote = () => apply(runGitOperation(projectId, () => api.gitFetch(target))).catch((e: unknown) => setError(errorMessage(e)));

  // 別のプロジェクトに切り替えた直後は、前のプロジェクトの状態を出さない
  const value = status?.key === key ? status.value : undefined;
  const count = value?.repo ? value.staged.length + value.unstaged.length + value.conflicts.length : 0;
  /** ほかの操作（ブランチの操作・途中のマージ）の応答で届いた状態を、取り直しを待たずに出す */
  const applyStatus = (next: GitStatus) => apply(Promise.resolve(next));
  /** 途中で止まっているマージ・リベースを、取りやめる・続ける・飛ばす（続けた先でまた衝突したら、衝突したファイルを返す） */
  const operate = async (action: GitOperationAction): Promise<string[]> => {
    const result = await api.gitOperation(target, action);
    await applyStatus(result.status);
    return result.conflicts;
  };
  /** 衝突したファイルを解く（こちらの版・取り込む側の版・いまの中身で解決済み） */
  const resolve = (path: string, how: GitConflictResolution) => apply(api.gitResolve(target, path, how));
  return { status: value, error, loading, refreshing, autoFetching, version, refresh: () => refresh(), autoFetch, act, commit, push, pull, fetchRemote, applyStatus, operate, resolve, count };
}

export type GitStatusController = ReturnType<typeof useGitStatus>;
