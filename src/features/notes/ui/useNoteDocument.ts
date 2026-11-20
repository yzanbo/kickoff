import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { FileContent } from "@shared/foundation/fileTypes";
import { api, ApiError } from "@/foundation/ui/api";
import { onServerOpen, useServerEvent } from "@/foundation/ui/api/events";
import { errorMessage } from "@shared/foundation/errors";
import { useKeyedAsync } from "@/foundation/ui/hooks/useKeyedAsync";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { noteDraft } from "@/foundation/ui/storage/storageKeys";
import { readSetting, writeSetting } from "@/foundation/ui/storage/settings";
import { safeNoteName } from "@shared/notes/names";
import { notesStore } from "@/features/notes/ui/stores/notes";
import { registerNoteGuard } from "./noteGuards";
import { renamedPath } from "./notePaths";

/** 開いたとき（保存したとき）のノートの中身と指紋 */
interface NoteBase {
  key: string;
  projectId: number;
  path: string;
  content: string;
  hash: string;
}

/** 書いたものを、まだ保存していないノートとして残すまで（ミリ秒。打つたびに書かない） */
const DRAFT_DELAY_MS = 300;

/**
 * 保存の様子（saved = 保存済み / dirty = 書いた・まだ保存していない / saving = 保存中 /
 * conflict = ほかで変わっていて保存していない / error = 失敗）
 */
export type NoteSaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

/**
 * 開いているノート 1 つの読み込みと保存。保存は ⌘S（と保存のボタン）だけで、書いている間は保存しない（Obsidian と同じ ⌘S）。
 * まだ保存していない書きかけは、ノートを離れても・アプリを閉じても失わないよう noteDraft に残し、開き直したら「未保存」のまま戻す。
 * 別のノートへ移る・右の欄のタブを閉じるときは、noteGuards で保存するかを聞く。
 * 保存は開いたときの指紋と比べ、ほかで（チャットからの追記・Finder・ほかのアプリで）変わっていれば保存せずに conflict にする。
 * このノートが変わった知らせ（Kickoff の中でも、Finder・ほかのアプリでも）が届いたら、書きかけでなければ読み直す（書きかけなら conflict にして選んでもらう）。
 * 知らせを取りこぼしても古いまま見せないよう、ウィンドウに戻ったとき・サーバーにつなぎ直したときも確かめる（いつも最新を見せる）
 */
export function useNoteDocument(projectId: number, path: string) {
  const key = `${projectId}:${path}`;
  const loaded = useKeyedAsync<FileContent>(key, () => api.note(projectId, path));
  // 開いたとき（保存したとき）の中身と指紋（どのノートのものかも持つ。保存している間に別のノートへ移っても、前のノートへ保存できるように）
  const [base, setBase] = useState<NoteBase | null>(null);
  // 書き始めの中身（編集の部品を作るときに渡す）と、部品を作り直す番号（読み直したとき、中身を入れ直す）
  const [initial, setInitial] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<NoteSaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  // いま書いてある中身（書くたびに描き直さない）
  const text = useRef<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // いまの base（描き直しを待たずに読む。保存してすぐ閉じたときも、保存したあとの中身と比べるように）
  const current = useRef({ base });
  /** base を変える（描き直しを待たずに current にも入れる） */
  const changeBase = useCallback((b: NoteBase) => {
    current.current = { base: b };
    setBase(b);
  }, []);

  /** まだ保存していない書きかけを残す（保存したものと同じなら消す） */
  const writeDraft = useCallback((b: NoteBase) => {
    clearTimeout(draftTimer.current);
    const body = text.current;
    writeSetting(noteDraft(b.key), body === null || body === b.content ? null : { text: body, hash: b.hash });
  }, []);

  /** 中身を入れ直す（読み込んだ・読み直した）。書きかけは捨てる */
  const startFrom = useCallback((b: NoteBase, body: string, next: NoteSaveState) => {
    changeBase(b);
    text.current = body;
    setInitial(body);
    setState(next);
    setError(null);
    setRevision((n) => n + 1);
  }, [changeBase]);

  const file = loaded.data;
  // 読み込んだら、そこから書き始める（まだ保存していない書きかけがあれば、それを未保存のまま戻す。開いたあとでほかで変わっていれば conflict）
  const startLoaded = useEffectEvent((f: FileContent) => {
    const b = { key, projectId, path, content: f.content, hash: f.hash };
    const draft = readSetting(noteDraft(key));
    if (draft && draft.text !== f.content) startFrom(b, draft.text, draft.hash === f.hash ? "dirty" : "conflict");
    else {
      writeSetting(noteDraft(key), null);
      startFrom(b, f.content, "saved");
    }
  });
  useEffect(() => {
    if (file && base?.key !== key) startLoaded(file);
  }, [file, key, base?.key]);

  /** いま書いてある中身を保存する（変わっていなければ何もしない）。保存できた（する必要がなかった）か */
  const save = useCallback(
    async (force = false): Promise<boolean> => {
      const b = current.current.base;
      const content = text.current;
      if (!b || content === null) return true;
      if (content === b.content && !force) return true;
      setState("saving");
      const expectedHash = force ? null : b.hash;
      return api
        .saveNote(b.projectId, b.path, content, expectedHash)
        .then((saved) => {
          const next = { ...b, content, hash: saved.hash };
          writeDraft(next);
          // 保存している間に別のノートへ移っていれば、前のノートの指紋は入れない
          if (current.current.base?.key !== b.key) return true;
          changeBase(next);
          setState(text.current === content ? "saved" : "dirty");
          setError(null);
          return true;
        })
        .catch((e: unknown) => {
          if (current.current.base?.key !== b.key) return false;
          if (e instanceof ApiError && e.status === 409) {
            setState("conflict");
          } else {
            setState("error");
            setError(errorMessage(e));
          }
          return false;
        });
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
   * ノートの名前を変える（ファイルの名前を変える。同じフォルダのまま）。まだ保存していない書きかけは、新しい名前のノートへ持っていく
   * （開き直すと未保存のまま戻る）。変えたあとのパス（変わらなければ null）。同じ名前のノートがあれば失敗（409）
   */
  const rename = useCallback(async (name: string): Promise<string | null> => {
    const b = current.current.base;
    if (!b) return null;
    const to = renamedPath(b.path, false, safeNoteName(name));
    if (to === b.path) return null;
    await api.moveNote(b.projectId, b.path, to);
    clearTimeout(draftTimer.current);
    const body = text.current;
    writeSetting(noteDraft(b.key), null);
    if (body !== null && body !== b.content) writeSetting(noteDraft(`${b.projectId}:${to}`), { text: body, hash: b.hash });
    // 閉じるときに、前の名前で書きかけを残さない
    current.current = { base: null };
    notesStore.invalidate(b.projectId);
    return to;
  }, []);

  /** いまのノートを読み直す（書きかけは捨てる） */
  const reload = useCallback(async () => {
    clearTimeout(draftTimer.current);
    const fresh = await api.note(projectId, path);
    writeSetting(noteDraft(key), null);
    startFrom({ key, projectId, path, content: fresh.content, hash: fresh.hash }, fresh.content, "saved");
  }, [projectId, path, key, startFrom]);

  // 別のノートへ移る・閉じるときは、書きかけを待たずに残す（保存はしない）
  useEffect(
    () => () => {
      const b = current.current.base;
      if (b?.key === key) writeDraft(b);
    },
    [key, writeDraft],
  );

  // 離れるときに保存するかを聞けるよう、このノートの様子と操作を知らせておく（noteGuards）
  useEffect(
    () =>
      registerNoteGuard(key, {
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
          writeSetting(noteDraft(key), null);
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
    void api.note(projectId, path).then(
      (fresh) => {
        const now = current.current.base;
        if (now?.key !== key || fresh.hash === now.hash) return;
        if (text.current === now.content) startFrom({ ...now, content: fresh.content, hash: fresh.hash }, fresh.content, "saved");
        else setState("conflict");
      },
      () => {},
    );
  };
  // このノートが変わった（チャットからの追記・Finder・ほかのアプリ・ほかの場所で開いた同じノートの保存など）
  useServerEvent("notes", (e) => {
    if (e.project_id === projectId && (e.path === null || e.path === path)) checkFresh();
  });
  // 知らせを取りこぼしたときのために: ウィンドウに戻ったとき・サーバーにつなぎ直したとき（切れている間の知らせは届かない）
  useWindowEvent("focus", checkFresh);
  const checkOnOpen = useEffectEvent(() => checkFresh());
  useEffect(() => onServerOpen(() => checkOnOpen()), []);

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
