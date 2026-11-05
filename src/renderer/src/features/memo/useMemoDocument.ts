import { useCallback, useEffect, useRef, useState } from "react";
import type { FileContent } from "@shared/types";
import { api, ApiError } from "@/api";
import { useServerEvent } from "@/api/events";
import { errorMessage } from "@shared/errors";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";

/** 開いたとき（保存したとき）のメモの中身と指紋 */
interface MemoBase {
  key: string;
  projectId: number;
  path: string;
  content: string;
  hash: string;
}

/** 書くのが止まってから保存するまで（ミリ秒） */
const SAVE_DELAY_MS = 700;

/** 保存の様子（idle = 保存済み / pending = 書いた・保存待ち / saving = 保存中 / conflict = ほかで変わっていて保存していない / error = 失敗） */
export type MemoSaveState = "idle" | "pending" | "saving" | "conflict" | "error";

/**
 * 開いているメモ 1 つの読み込みと、自動の保存。書くのが止まったら（と、別のメモへ移る・閉じるときに）保存する。
 * 保存は開いたときの指紋と比べ、ほかで（チャットからの追記・Finder・ほかのアプリで）変わっていれば保存せずに conflict にする。
 * Kickoff の中でこのメモが変わった知らせが届いたら、書きかけでなければ読み直す（書きかけなら conflict にして選んでもらう）
 */
export function useMemoDocument(projectId: number, path: string) {
  const key = `${projectId}:${path}`;
  const loaded = useKeyedAsync<FileContent>(key, () => api.memo(projectId, path));
  // 開いたとき（保存したとき）の中身と指紋。読み込んだら入れる（どのメモのものかも持つ。別のメモへ移ったあとでも、前のメモへ保存できるように）
  const [base, setBase] = useState<MemoBase | null>(null);
  // 編集の部品を作り直す番号（読み直したとき、中身を入れ直す）
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<MemoSaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  // いま書いてある中身（書くたびに描き直さない）
  const text = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef({ base });
  current.current = { base };

  const file = loaded.data;
  // 読み込んだら、そこから書き始める（別のメモに変わったときも）
  useEffect(() => {
    if (!file || base?.key === key) return;
    setBase({ key, projectId, path, content: file.content, hash: file.hash });
    text.current = file.content;
    setState("idle");
    setError(null);
    setRevision((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, key, base?.key]);

  /** いま書いてある中身を保存する（変わっていなければ何もしない） */
  const save = useCallback(async (force = false) => {
    clearTimeout(timer.current);
    const b = current.current.base;
    const content = text.current;
    if (!b || content === null || (content === b.content && !force)) return;
    setState("saving");
    try {
      const saved = await api.saveMemo(b.projectId, b.path, content, force ? null : b.hash);
      // 保存している間に別のメモへ移っていれば、前のメモの指紋は入れない
      if (current.current.base?.key !== b.key) return;
      setBase({ ...b, content, hash: saved.hash });
      setState(text.current === content ? "idle" : "pending");
      setError(null);
    } catch (e) {
      if (current.current.base?.key !== b.key) return;
      if (e instanceof ApiError && e.status === 409) {
        setState("conflict");
      } else {
        setState("error");
        setError(errorMessage(e));
      }
    }
  }, []);

  /** 書いたとき（少し待ってから保存する） */
  const change = useCallback(
    (value: string) => {
      text.current = value;
      setState((s) => (s === "conflict" ? s : "pending"));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // ほかで変わっているのが分かっている間は、上書きしない（読み直すか上書きするかを選んでもらう）
        void save();
      }, SAVE_DELAY_MS);
    },
    [save],
  );

  // 別のメモへ移る・タブを閉じるときは、書きかけを保存してから
  useEffect(
    () => () => {
      void save();
    },
    [key, save],
  );

  /** ほかでの変更を読み直す（書きかけは捨てる） */
  const reload = useCallback(async () => {
    clearTimeout(timer.current);
    const fresh = await api.memo(projectId, path);
    setBase({ key, projectId, path, content: fresh.content, hash: fresh.hash });
    text.current = fresh.content;
    setState("idle");
    setError(null);
    setRevision((n) => n + 1);
  }, [projectId, path, key]);

  // Kickoff の中でこのメモが変わった（チャットからの追記など）。自分の保存の知らせなら、指紋が同じなので何もしない
  useServerEvent((e) => {
    if (e.type !== "memos" || e.project_id !== projectId || (e.path !== null && e.path !== path)) return;
    const b = current.current.base;
    if (!b || b.key !== key) return;
    void api.memo(projectId, path).then(
      (fresh) => {
        if (current.current.base?.key !== key || fresh.hash === current.current.base.hash) return;
        if (text.current === current.current.base.content) {
          setBase({ key, projectId, path, content: fresh.content, hash: fresh.hash });
          text.current = fresh.content;
          setRevision((n) => n + 1);
        } else {
          setState("conflict");
        }
      },
      () => {},
    );
  });

  return {
    file,
    loadError: loaded.error,
    /** 書き始めの中身（読み込むまでは null） */
    initial: base?.key === key ? base.content : null,
    revision,
    state,
    error,
    change,
    /** いま書いてある中身（読む表示に切り替えたとき） */
    currentText: () => text.current ?? "",
    /** ⌘S（すぐ保存する） */
    saveNow: () => void save(),
    /** ほかで変わっていても、書いたもので上書きする */
    overwrite: () => void save(true),
    reload,
  };
}
