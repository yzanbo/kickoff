import { useCallback, useEffect, useRef, useState } from "react";
import type { GitStatus } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { useServerEvent } from "../../events";
import { useWindowEvent } from "../../hooks/useWindowEvent";
import { useGitTarget } from "../../worktree/worktreeContext";

/** 変更のタブを開いている間に取り直す間隔（エディタなど、Kickoff の外での変更にも追いつくため） */
const POLL_MS = 5000;
/** 変更のタブを開いている間に、リモートの情報を取ってくる間隔（VS Code の自動フェッチと同じ考え方） */
const FETCH_MS = 3 * 60_000;
/** チャットが動いたあと、取り直すまで待つ時間（続けて届く知らせをまとめる） */
const RUN_DELAY_MS = 1500;

/**
 * プロジェクトのフォルダの Git の状態。開いたとき・ウィンドウに戻ってきたとき・このプロジェクトのチャットが動いたときに取り直す。
 * active（変更のタブを開いている）の間は、一定の間隔でも取り直す。count はタブのバッジに出す変更のあるファイルの数。
 * worktree は作業場所（ワークツリーのフォルダ。省略なら本体）
 */
export function useGitStatus(projectId: number, active: boolean, worktree?: string) {
  const { target, key } = useGitTarget(projectId, worktree);
  const [status, setStatus] = useState<{ key: string; value: GitStatus }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  // 取り直すたびに増やす（差分も取り直すため）。古い応答で上書きしないためにも使う
  const [version, setVersion] = useState(0);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    try {
      const value = await api.gitStatus(target);
      if (request !== latest.current) return;
      setStatus({ key, value });
      setVersion((v) => v + 1);
      setError(undefined);
    } catch (e) {
      if (request === latest.current) setError(errorMessage(e));
    } finally {
      if (request === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh]);

  useWindowEvent("focus", () => void refresh());

  const runTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useServerEvent((e) => {
    if (e.type !== "run" || e.run.project_id !== projectId) return;
    clearTimeout(runTimer.current);
    runTimer.current = setTimeout(() => void refresh(), RUN_DELAY_MS);
  });
  useEffect(() => () => clearTimeout(runTimer.current), []);

  /** 操作のあとの状態をそのまま出す（取り直しを待たない） */
  const apply = async (request: Promise<GitStatus>) => {
    const value = await request;
    latest.current++;
    setStatus({ key, value });
    setVersion((v) => v + 1);
  };
  /** ステージ・ステージの取り消し・元に戻す */
  const act = (action: "stage" | "unstage" | "discard", paths: string[]) => apply(api.gitAction(target, action, paths));
  const commit = (message: string) => apply(api.gitCommit(target, message));
  const push = () => apply(api.gitPush(target));
  const pull = () => apply(api.gitPull(target));
  /** リモートの情報を取ってきてから取り直す（遅れている数を出すため。取り直しのボタンで使う） */
  const fetchRemote = () => apply(api.gitFetch(target)).catch((e: unknown) => setError(errorMessage(e)));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void api.gitFetch(target).then(() => refresh(), () => undefined), FETCH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key]);

  // 別のプロジェクトに切り替えた直後は、前のプロジェクトの状態を出さない
  const value = status?.key === key ? status.value : undefined;
  const count = value?.repo ? value.staged.length + value.unstaged.length + value.conflicts.length : 0;
  return { status: value, error, loading, version, refresh, act, commit, push, pull, fetchRemote, count };
}

export type GitStatusController = ReturnType<typeof useGitStatus>;
