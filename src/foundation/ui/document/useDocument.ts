import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError } from "@/foundation/ui/api/http";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { useQuery, type QueryOptions } from "@/foundation/ui/query/useQuery";
import { toError } from "@/foundation/ui/query/queryState";
import { readSetting, writeSetting, type SettingFamily } from "@/foundation/ui/storage";
import { draftOf, freshAction, startDocument, statusAfterEdit, type DocumentDraft, type DocumentFile, type DocumentStatus } from "./documentState";
import { registerUnsaved } from "./unsaved";

/** 文書の読み書きの口（ファイル・ノートが渡す） */
export interface DocumentSource {
  /** いまの中身（SSE・窓に戻ったときに取り直す） */
  read(signal: AbortSignal): Promise<DocumentFile>;
  /** 保存。expectedHash が null なら指紋なしで上書き。ほかで変わっていれば 409 の ApiError を投げる */
  write(content: string, expectedHash: string | null): Promise<{ hash: string }>;
}

export interface UseDocumentOptions {
  /** 文書の見分け（"<projectId>:<path>" など。替わったら開き直す） */
  key: string;
  source: DocumentSource;
  /** 取り直す SSE の種類（useQuery の refetchOn と同じ形） */
  refetchOn?: QueryOptions<DocumentFile>["refetchOn"];
  /** 書きかけを保存に残す（ノートは残す・ファイルは渡さない＝残さない） */
  draft?: SettingFamily<DocumentDraft | null>;
  /** 未保存の登録簿に出す名前・置き場所 */
  title: string;
  surface: string;
}

export interface DocumentState {
  status: DocumentStatus;
  /** 開いたとき（保存したとき）の中身と指紋（読み込むまでは null） */
  base: DocumentFile | null;
  /** 書き始めの中身（編集の部品を作るときに渡す。読み込むまでは null） */
  initial: string | null;
  /** 編集の部品に中身を入れ直す番号（読み直したら増える） */
  revision: number;
  /** ほかで変わった（書きかけがあるので読み直していない） */
  changedOnDisk: boolean;
  error: Error | undefined;
  /** いま書いてある中身（描き直しの合図にはならない） */
  text(): string | null;
  setText(text: string): void;
  /** 保存（変わっていなければ何もしない）。409 なら status を conflict にする（聞かない）。force は指紋なしで上書き。保存できた（要らなかった）か */
  save(o?: { force?: boolean }): Promise<boolean>;
  /** ほかで変わった中身を読み直す（書きかけを捨てる） */
  reload(): Promise<void>;
}

/** 書いたものを書きかけとして残すまで（ミリ秒。打つたびに書かない） */
const DRAFT_DELAY_MS = 300;

interface Opened {
  key: string;
  base: DocumentFile;
}

/**
 * 開いて保存する文書 1 つ（ファイル・ノートの 2 つの実装を 1 つにしたもの）。保存は呼んだときだけ（書いている間は保存しない）。
 * 保存は開いたときの指紋と比べ、ほかで変わっていれば conflict にする。書きかけがなく、ほかで変わったら黙って読み直す。
 * draft を渡せば、書きかけを離れても・アプリを閉じても残し、開き直したら戻す（指紋が同じなら dirty、違えば conflict）。
 * 未保存の登録簿（unsaved.ts）に出すので、⌘⇧S・離れる前の確かめが置き場所を問わず数える
 */
export function useDocument({ key, source, refetchOn, draft, title, surface }: UseDocumentOptions): DocumentState {
  const loaded = useQuery<DocumentFile>(key, (signal) => source.read(signal), {
    refetchOn,
    refetchOnFocus: true,
    same: (a, b) => a.hash === b.hash && a.content === b.content,
  });
  const [opened, setOpened] = useState<Opened | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [saveError, setSaveError] = useState<Error | undefined>(undefined);
  // いま書いてある中身と、開いている文書（描き直しを待たずに読む。保存してすぐ閉じたときも、保存したあとの中身と比べるように）
  const text = useRef<string | null>(null);
  const current = useRef<Opened | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const changeBase = (next: Opened) => {
    current.current = next;
    setOpened(next);
  };
  /** 書きかけを残す（保存したものと同じなら消す） */
  const writeDraft = useEffectEvent((o: Opened) => {
    clearTimeout(draftTimer.current);
    if (draft && text.current !== null) writeSetting(draft(o.key), draftOf(text.current, o.base));
  });
  /** 中身を入れ直す（読み込んだ・読み直した）。書きかけは捨てる */
  const startFrom = (o: Opened, body: string, next: DocumentStatus) => {
    changeBase(o);
    text.current = body;
    setInitial(body);
    setStatus(next);
    setChangedOnDisk(next === "conflict");
    setSaveError(undefined);
    setRevision((n) => n + 1);
  };

  // 読み込んだら書き始める。開いたあとに届いた中身は、ほかで変わったかを見る
  const onFile = useEffectEvent((f: DocumentFile) => {
    const now = current.current;
    if (now?.key !== key) {
      const start = startDocument(f, draft ? readSetting(draft(key)) : null);
      if (draft && start.dropDraft) writeSetting(draft(key), null);
      startFrom({ key, base: f }, start.text, start.status);
      return;
    }
    const action = freshAction(now.base, text.current ?? now.base.content, f);
    if (action === "reload") startFrom({ key, base: f }, f.content, "saved");
    else if (action === "conflict") {
      setStatus("conflict");
      setChangedOnDisk(true);
    }
  });
  const file = loaded.data;
  useEffect(() => {
    if (file) onFile(file);
  }, [file]);

  const save = async ({ force = false }: { force?: boolean } = {}): Promise<boolean> => {
    const now = current.current;
    const content = text.current;
    if (!now || content === null) return true;
    if (content === now.base.content && !force) return true;
    setStatus("saving");
    try {
      const saved = await source.write(content, force ? null : now.base.hash);
      const next = { key: now.key, base: { content, hash: saved.hash } };
      // 保存している間に別の文書へ移っていれば、前の文書の指紋は入れない（残した書きかけが保存したものと同じなら消す）
      if (current.current?.key !== now.key) {
        if (draft && readSetting(draft(now.key))?.text === content) writeSetting(draft(now.key), null);
        return true;
      }
      writeDraft(next);
      changeBase(next);
      setStatus(text.current === content ? "saved" : "dirty");
      setChangedOnDisk(false);
      setSaveError(undefined);
      return true;
    } catch (e) {
      if (current.current?.key !== now.key) return false;
      if (e instanceof ApiError && e.status === 409) {
        setStatus("conflict");
        setChangedOnDisk(true);
      } else {
        setStatus("error");
        setSaveError(toError(e));
      }
      return false;
    }
  };
  const saveNow = useEffectEvent(() => save());

  const setText = (value: string) => {
    text.current = value;
    const now = current.current;
    if (!now) return;
    setStatus((s) => statusAfterEdit(s, value, now.base));
    if (!draft) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => writeDraft(now), DRAFT_DELAY_MS);
  };

  const reload = async () => {
    clearTimeout(draftTimer.current);
    const fresh = await source.read(new AbortController().signal);
    if (draft) writeSetting(draft(key), null);
    startFrom({ key, base: fresh }, fresh.content, "saved");
  };

  /** 書きかけを待たずに残す（別の文書へ移る・閉じる・ページを離れるとき。保存はしない）。of は開いていた文書の見分け */
  const flush = (of: string) => {
    const now = current.current;
    if (now?.key === of) writeDraft(now);
  };
  useEffect(() => () => flush(key), [key]);
  useWindowEvent("pagehide", () => flush(key), Boolean(draft));

  // ⌘⇧S・離れる前の確かめが数えるよう、この文書の様子と操作を登録簿に出す
  useEffect(
    () =>
      registerUnsaved({
        key,
        surface,
        title,
        dirty: () => {
          const now = current.current;
          return now?.key === key && text.current !== null && text.current !== now.base.content;
        },
        save: () => saveNow(),
        discard: () => {
          clearTimeout(draftTimer.current);
          // 書いたものを保存したものに戻す（閉じるときに、捨てた書きかけをまた残さないように）
          const now = current.current;
          if (now?.key === key) text.current = now.base.content;
          if (draft) writeSetting(draft(key), null);
        },
        flush: draft ? () => flush(key) : undefined,
      }),
    [key, surface, title, draft],
  );

  const mine = opened?.key === key;
  return {
    status: mine ? status : loaded.error ? "error" : "loading",
    base: mine ? opened.base : null,
    initial: mine ? initial : null,
    revision,
    changedOnDisk: mine && changedOnDisk,
    error: loaded.error ?? saveError,
    text: () => text.current,
    setText,
    save,
    reload,
  };
}
