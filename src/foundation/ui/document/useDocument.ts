import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError } from "@/foundation/ui/api/http";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { useQuery, type QueryOptions } from "@/foundation/ui/query/useQuery";
import { toError } from "@/foundation/ui/query/queryState";
import { readSetting, writeSetting, type SettingFamily } from "@/foundation/ui/storage";
import { draftOf, freshAction, startDocument, statusAfterEdit, type DocumentDraft, type DocumentFile, type DocumentStatus } from "./documentState";
import { notifyUnsavedChange, registerUnsaved, useUnsavedSurface, type UnsavedEntry } from "./unsaved";

/** 文書の読み書きの口（ファイル・ノートが渡す。F は読んだ中身の形で、中身と指紋のほかを持ってよい） */
export interface DocumentSource<F extends DocumentFile = DocumentFile> {
  /** いまの中身（SSE・窓に戻ったとき・deps が変わったときに取り直す） */
  read(signal: AbortSignal): Promise<F>;
  /** 保存。expectedHash が null なら指紋なしで上書き。ほかで変わっていれば 409 の ApiError を投げる */
  write(content: string, expectedHash: string | null): Promise<{ hash: string }>;
}

export interface UseDocumentOptions<F extends DocumentFile = DocumentFile> {
  /** 文書の見分け（"<projectId>:<path>" など。替わったら開き直す） */
  key: string;
  source: DocumentSource<F>;
  /** 取り直す SSE の種類（useQuery の refetchOn と同じ形） */
  refetchOn?: QueryOptions<F>["refetchOn"];
  /** 変わったら取り直す値（useQuery の deps。ファイルは Git の状態を取り直した回） */
  deps?: readonly unknown[];
  /** 窓に戻ったら取り直す（既定 true） */
  refetchOnFocus?: boolean;
  /** 保存できたとき（どこから保存しても。⌘⇧S・閉じる前の確かめも） */
  onSaved?(): void;
  /** 書きかけを保存に残す（ノートは残す・ファイルは渡さない＝残さない） */
  draft?: SettingFamily<DocumentDraft | null>;
  /** 未保存の登録簿に出す名前・置き場所（入れ物が UnsavedSurfaceContext で渡していればそちら） */
  title: string;
  surface: string;
  /** 未保存の登録簿の置いたタブ・作業場所のファイル（UnsavedEntry の tab・file） */
  tab?: string;
  file?: UnsavedEntry["file"];
}

export interface DocumentState<F extends DocumentFile = DocumentFile> {
  status: DocumentStatus;
  /** いま読み込んである中身（取り直すと替わる。読み込むまでは undefined） */
  file: F | undefined;
  /** 開いたとき（保存したとき）の中身と指紋（読み込むまでは null） */
  base: DocumentFile | null;
  /** まだ保存していない書きかけがあるか */
  dirty: boolean;
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
  /** 書きかけを捨てる（書いたものを保存したものに戻し、残した書きかけも消す。閉じるときにまた残さない） */
  discard(): void;
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
export function useDocument<F extends DocumentFile = DocumentFile>({
  key,
  source,
  refetchOn,
  deps,
  refetchOnFocus = true,
  onSaved,
  draft,
  title,
  surface: ownSurface,
  tab,
  file: place,
}: UseDocumentOptions<F>): DocumentState<F> {
  const surface = useUnsavedSurface(ownSurface);
  const loaded = useQuery<F>(key, (signal) => source.read(signal), {
    refetchOn,
    deps,
    refetchOnFocus,
    same: (a, b) => a.hash === b.hash && a.content === b.content,
  });
  const [opened, setOpened] = useState<Opened | null>(null);
  const [initial, setInitial] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [changedOnDisk, setChangedOnDisk] = useState(false);
  const [saveError, setSaveError] = useState<Error | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
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
    setDirty(body !== o.base.content);
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

  const afterSave = useEffectEvent(() => onSaved?.());
  const save = async ({ force = false }: { force?: boolean } = {}): Promise<boolean> => {
    const now = current.current;
    const content = text.current;
    if (!now || content === null) return true;
    if (content === now.base.content && !force) return true;
    setStatus("saving");
    // 書く・失敗の受け取りと、そのあとの様子の入れ直しを分ける（try の中に条件の式を置くと React Compiler が外す）
    const expected = force ? null : now.base.hash;
    const written = await source.write(content, expected).then(
      (saved) => ({ saved }),
      (error: unknown) => ({ error }),
    );
    const moved = current.current?.key !== now.key;
    if ("error" in written) {
      if (moved) return false;
      if (written.error instanceof ApiError && written.error.status === 409) {
        setStatus("conflict");
        setChangedOnDisk(true);
      } else {
        setStatus("error");
        setSaveError(toError(written.error));
      }
      return false;
    }
    const next = { key: now.key, base: { content, hash: written.saved.hash } };
    // 保存している間に別の文書へ移っていれば、前の文書の指紋は入れない（残した書きかけが保存したものと同じなら消す）
    if (moved) {
      if (draft && readSetting(draft(now.key))?.text === content) writeSetting(draft(now.key), null);
      return true;
    }
    writeDraft(next);
    changeBase(next);
    setDirty(text.current !== content);
    setStatus(text.current === content ? "saved" : "dirty");
    setChangedOnDisk(false);
    setSaveError(undefined);
    afterSave();
    return true;
  };
  const saveNow = useEffectEvent(() => save());

  const setText = (value: string) => {
    text.current = value;
    const now = current.current;
    if (!now) return;
    setDirty(value !== now.base.content);
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

  const discard = () => {
    clearTimeout(draftTimer.current);
    // 書いたものを保存したものに戻す（閉じるときに、捨てた書きかけをまた残さないように）
    const now = current.current;
    if (now?.key === key) text.current = now.base.content;
    setDirty(false);
    if (draft) writeSetting(draft(key), null);
  };
  const discardNow = useEffectEvent(discard);

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
        discard: () => discardNow(),
        flush: draft ? () => flush(key) : undefined,
        tab,
        file: place && { root: place.root, path: place.path },
      }),
    [key, surface, title, draft, tab, place?.root, place?.path],
  );
  // タブの「●」など、書きかけの有無を読む所に知らせる
  useEffect(() => notifyUnsavedChange(), [dirty]);

  const mine = opened?.key === key;
  return {
    status: mine ? status : loaded.error ? "error" : "loading",
    file: loaded.data,
    base: mine ? opened.base : null,
    dirty: mine && dirty,
    initial: mine ? initial : null,
    revision,
    changedOnDisk: mine && changedOnDisk,
    error: loaded.error ?? saveError,
    text: () => text.current,
    setText,
    save,
    reload,
    discard,
  };
}
