import { useCallback, useEffect, useRef, useState } from "react";
import type { FileContent } from "@shared/types";
import { api, ApiError } from "@/api";
import { subscribeServerOpen, useServerEvent } from "@/api/events";
import { errorMessage } from "@shared/errors";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { memoDraft } from "@/lib/storageKeys";
import { readSetting, writeSetting } from "@/lib/storage";
import { safeMemoName } from "@shared/memo/names";
import { memosStore } from "@/stores/memos";
import { registerMemoGuard } from "./memoGuards";
import { renamedPath } from "./memoPaths";

/** 開いたとき（保存したとき）のメモの中身と指紋 */
interface MemoBase {
  key: string;
  projectId: number;
  path: string;
  content: string;
  hash: string;
}

/** 書いたものを、まだ保存していないメモとして残すまで（ミリ秒。打つたびに書かない） */
const DRAFT_DELAY_MS = 300;

/**
 * 保存の様子（saved = 保存済み / dirty = 書いた・まだ保存していない / saving = 保存中 /
 * conflict = ほかで変わっていて保存していない / error = 失敗）
 */
export type MemoSaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

/**
 * 開いているメモ 1 つの読み込みと保存。保存は ⌘S（と保存のボタン）だけで、書いている間は保存しない（Obsidian と同じ ⌘S）。
 * まだ保存していない書きかけは、メモを離れても・アプリを閉じても失わないよう memoDraft に残し、開き直したら「未保存」のまま戻す。
 * 別のメモへ移る・右の欄のタブを閉じるときは、memoGuards で保存するかを聞く。
 * 保存は開いたときの指紋と比べ、ほかで（チャットからの追記・Finder・ほかのアプリで）変わっていれば保存せずに conflict にする。
 * このメモが変わった知らせ（Kickoff の中でも、Finder・ほかのアプリでも）が届いたら、書きかけでなければ読み直す（書きかけなら conflict にして選んでもらう）。
 * 知らせを取りこぼしても古いまま見せないよう、ウィンドウに戻ったとき・サーバーにつなぎ直したときも確かめる（いつも最新を見せる）
 */
export function useMemoDocument(projectId: number, path: string) {
  const key = `${projectId}:${path}`;
  const loaded = useKeyedAsync<FileContent>(key, () => api.memo(projectId, path));
  // 開いたとき（保存したとき）の中身と指紋（どのメモのものかも持つ。保存している間に別のメモへ移っても、前のメモへ保存できるように）
  const [base, setBase] = useState<MemoBase | null>(null);
  // 書き始めの中身（編集の部品を作るときに渡す）と、部品を作り直す番号（読み直したとき、中身を入れ直す）
  const [initial, setInitial] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<MemoSaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  // いま書いてある中身（書くたびに描き直さない）
  const text = useRef<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // いまの base（描き直しを待たずに読む。保存してすぐ閉じたときも、保存したあとの中身と比べるように）
  const current = useRef({ base });
  /** base を変える（描き直しを待たずに current にも入れる） */
  const changeBase = useCallback((b: MemoBase) => {
    current.current = { base: b };
    setBase(b);
  }, []);

  /** まだ保存していない書きかけを残す（保存したものと同じなら消す） */
  const writeDraft = useCallback((b: MemoBase) => {
    clearTimeout(draftTimer.current);
    const body = text.current;
    writeSetting(memoDraft(b.key), body === null || body === b.content ? null : { text: body, hash: b.hash });
  }, []);

  /** 中身を入れ直す（読み込んだ・読み直した）。書きかけは捨てる */
  const startFrom = useCallback((b: MemoBase, body: string, next: MemoSaveState) => {
    changeBase(b);
    text.current = body;
    setInitial(body);
    setState(next);
    setError(null);
    setRevision((n) => n + 1);
  }, [changeBase]);

  const file = loaded.data;
  // 読み込んだら、そこから書き始める（まだ保存していない書きかけがあれば、それを未保存のまま戻す。開いたあとでほかで変わっていれば conflict）
  useEffect(() => {
    if (!file || base?.key === key) return;
    const b = { key, projectId, path, content: file.content, hash: file.hash };
    const draft = readSetting(memoDraft(key));
    if (draft && draft.text !== file.content) startFrom(b, draft.text, draft.hash === file.hash ? "dirty" : "conflict");
    else {
      writeSetting(memoDraft(key), null);
      startFrom(b, file.content, "saved");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, key, base?.key]);

  /** いま書いてある中身を保存する（変わっていなければ何もしない）。保存できた（する必要がなかった）か */
  const save = useCallback(
    async (force = false): Promise<boolean> => {
      const b = current.current.base;
      const content = text.current;
      if (!b || content === null) return true;
      if (content === b.content && !force) return true;
      setState("saving");
      try {
        const saved = await api.saveMemo(b.projectId, b.path, content, force ? null : b.hash);
        const next = { ...b, content, hash: saved.hash };
        writeDraft(next);
        // 保存している間に別のメモへ移っていれば、前のメモの指紋は入れない
        if (current.current.base?.key !== b.key) return true;
        changeBase(next);
        setState(text.current === content ? "saved" : "dirty");
        setError(null);
        return true;
      } catch (e) {
        if (current.current.base?.key !== b.key) return false;
        if (e instanceof ApiError && e.status === 409) {
          setState("conflict");
        } else {
          setState("error");
          setError(errorMessage(e));
        }
        return false;
      }
    },
    [writeDraft, changeBase],
  );

  /** 書いたとき（保存はしない。書きかけを少し待って残す） */
  const change = useCallback(
    (value: string) => {
      text.current = value;
      const b = current.current.base;
      if (!b) return;
      setState((s) => (s === "conflict" ? s : value === b.content ? "saved" : "dirty"));
      clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => writeDraft(b), DRAFT_DELAY_MS);
    },
    [writeDraft],
  );

  /**
   * メモの名前を変える（ファイルの名前を変える。同じフォルダのまま）。まだ保存していない書きかけは、新しい名前のメモへ持っていく
   * （開き直すと未保存のまま戻る）。変えたあとのパス（変わらなければ null）。同じ名前のメモがあれば失敗（409）
   */
  const rename = useCallback(async (name: string): Promise<string | null> => {
    const b = current.current.base;
    if (!b) return null;
    const to = renamedPath(b.path, false, safeMemoName(name));
    if (to === b.path) return null;
    await api.moveMemo(b.projectId, b.path, to);
    clearTimeout(draftTimer.current);
    const body = text.current;
    writeSetting(memoDraft(b.key), null);
    if (body !== null && body !== b.content) writeSetting(memoDraft(`${b.projectId}:${to}`), { text: body, hash: b.hash });
    // 閉じるときに、前の名前で書きかけを残さない
    current.current = { base: null };
    memosStore.invalidate(b.projectId);
    return to;
  }, []);

  /** いまのメモを読み直す（書きかけは捨てる） */
  const reload = useCallback(async () => {
    clearTimeout(draftTimer.current);
    const fresh = await api.memo(projectId, path);
    writeSetting(memoDraft(key), null);
    startFrom({ key, projectId, path, content: fresh.content, hash: fresh.hash }, fresh.content, "saved");
  }, [projectId, path, key, startFrom]);

  // 別のメモへ移る・閉じるときは、書きかけを待たずに残す（保存はしない）
  useEffect(
    () => () => {
      const b = current.current.base;
      if (b?.key === key) writeDraft(b);
    },
    [key, writeDraft],
  );

  // 離れるときに保存するかを聞けるよう、このメモの様子と操作を知らせておく（memoGuards）
  useEffect(
    () =>
      registerMemoGuard(key, {
        dirty: () => {
          const b = current.current.base;
          return b?.key === key && text.current !== null && text.current !== b.content;
        },
        save: () => save(),
        discard: () => {
          clearTimeout(draftTimer.current);
          // 書いたものを保存したものに戻す（閉じるときに、捨てた書きかけをまた残さないように）
          const b = current.current.base;
          if (b?.key === key) text.current = b.content;
          writeSetting(memoDraft(key), null);
        },
        flush: () => {
          const b = current.current.base;
          if (b?.key === key) writeDraft(b);
        },
      }),
    [key, save, writeDraft],
  );

  /** ファイルがいまも開いたときのままかを確かめ、変わっていれば読み直す（書きかけなら conflict）。自分の保存なら指紋が同じなので何もしない */
  const checkFresh = () => {
    const b = current.current.base;
    if (!b || b.key !== key) return;
    void api.memo(projectId, path).then(
      (fresh) => {
        const now = current.current.base;
        if (now?.key !== key || fresh.hash === now.hash) return;
        if (text.current === now.content) startFrom({ ...now, content: fresh.content, hash: fresh.hash }, fresh.content, "saved");
        else setState("conflict");
      },
      () => {},
    );
  };
  const checkRef = useRef(checkFresh);
  checkRef.current = checkFresh;
  // このメモが変わった（チャットからの追記・Finder・ほかのアプリ・ほかの場所で開いた同じメモの保存など）
  useServerEvent((e) => {
    if (e.type === "memos" && e.project_id === projectId && (e.path === null || e.path === path)) checkFresh();
  });
  // 知らせを取りこぼしたときのために: ウィンドウに戻ったとき・サーバーにつなぎ直したとき（切れている間の知らせは届かない）
  useWindowEvent("focus", checkFresh);
  useEffect(() => subscribeServerOpen(() => checkRef.current()), []);

  return {
    file,
    loadError: loaded.error,
    /** 書き始めの中身（読み込むまでは null） */
    initial: base?.key === key ? initial : null,
    revision,
    state,
    error,
    /** いま書いてある中身（保存していない書きかけも。読み込むまでは null。描き直しの合図にはならない） */
    text: () => text.current,
    change,
    /** 本文を保存する（変わっていなければ何もしない）。保存できた（する必要がなかった）か */
    save: () => save(),
    /** ほかで変わっていても、書いたもので上書きする */
    overwrite: () => void save(true),
    /** ほかでの変更を読み直す（書いたものは捨てる） */
    reload,
    rename,
  };
}
