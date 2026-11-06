import { CodeXml, Eye, FolderSearch, MessagesSquare, Paperclip, Save } from "lucide-react";
import { memoExtensionOf, memoKindOf, type MemoKind } from "@shared/memo/kinds";
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { isCancelKey, isComposing, isKey } from "@/lib/keys";
import { MEMO_CHAT_OPEN, MEMO_CHAT_WIDTH, MEMO_VIEW } from "@/lib/storageKeys";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { useMemoList } from "@/stores/memos";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { alertDialog, reportFailure } from "@/ui/dialogs";
import { Segmented } from "@/ui/Segmented";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { HtmlMemoPage, type HtmlMemoPageHandle } from "./HtmlMemoPage";
import type { MemoEditorHandle } from "./MemoEditor";
import { MemoChat, type MemoChatHandle } from "./MemoChat";
import { MemoQuickChat } from "./MemoQuickChat";
import { memoChatTargets } from "./memoChatTargets";
import { MemoSelectionAttach } from "./MemoSelectionAttach";
import { memoTitle, parentOf } from "./memoPaths";
import { useMemoDocument, type MemoSaveState } from "./useMemoDocument";
import { useMemoEditMenu } from "./useMemoEditMenu";

// 編集の部品（CodeMirror）は大きいので、メモを開いたときに初めて読み込む
const MemoEditor = lazy(() => import("./MemoEditor"));

/** 題名の欄に書ける長さ（文字） */
const TITLE_MAX = 120;

/** 表示の切り替えの説明（種類ごと。preview = 整えて見せる / edit = 中身をそのまま） */
const VIEW_LABELS: Record<MemoKind, { preview: string; edit: string }> = {
  markdown: {
    preview: "Markdown で表示（見出し・太字・リストなどを整えて見せる。カーソルのある行だけ記号を見せる）",
    edit: "そのまま表示（Markdown の記号もそのまま見せる）",
  },
  html: {
    preview: "ページで表示（HTML と CSS を描いた見た目。ここでは書けない）",
    edit: "ソースを表示（HTML と CSS をそのまま書く）",
  },
};

/** 保存の様子の文（見出しの右） */
const SAVE_LABELS: Record<MemoSaveState, string> = {
  saved: "保存済み",
  dirty: "未保存（⌘S で保存）",
  saving: "保存中…",
  conflict: "ほかで変わりました",
  error: "保存できませんでした",
};

/**
 * 開いているメモ（見出しに題名（すぐ後ろに拡張子を続け、ファイル名と同じに見せる）とフォルダ・保存の様子・保存・表示の切り替え・Finder で表示）。
 * 表示は Markdown（Obsidian のライブプレビューと同じ。カーソルの行だけ記号を見せる）/ そのまま（記号もそのまま）。
 * HTML のメモ（.html）は、ページ（描いた見た目。書けない）/ ソース（HTML をそのまま書く）。ソースの編集の部品はページの間も隠して置く（元に戻す履歴を残す）。
 * 書いた所で ⌘S で保存する（書いている間は保存しない。まだ保存していない書きかけは残り、離れるときに聞く）。
 * 題名はいつでも書き換えられる欄（押せばそのままキャレットが入る。入力の画面に切り替えない）で、本文と同じく ⌘S（題名の欄では Enter も）で
 * 本文を保存してからファイルの名前を変える（onRenamed に変えたあとのパス。開いている側がパスを付け替える）。Esc で元の題名に戻す。
 * HTML のメモのページのリンクがメモのフォルダの中を指すとき、メモなら onOpenMemo（開いている側が同じ場所で開く）、フォルダ・メモでないファイルは Finder で表示する。
 * attachTo（チャットの右の欄・別ウィンドウで開いたとき、開いたチャット）があれば、見出しのボタン・本文の右クリックで、
 * メモ全体（選んでいれば、その部分の引用）をそのチャットの入力欄に添付する。本文で文を選ぶと、上の「チャットに追加」ですぐ引用を足せる。
 * メモのチャットの欄を閉じている間は、下にこのメモを AI に直してもらう入力欄（MemoQuickChat）を出す
 */
export function MemoView({
  projectId,
  path,
  dir,
  onRenamed,
  onOpenMemo,
  attachTo = null,
}: {
  projectId: number;
  path: string;
  dir: string;
  onRenamed: (path: string) => void;
  onOpenMemo: (path: string) => void;
  attachTo?: number | null;
}) {
  const doc = useMemoDocument(projectId, path);
  const list = useMemoList(projectId);
  // 編集の部品を外から動かす口（右クリックのメニュー）と、メモのチャットの欄を動かす口（チャットに追加）
  const editor = useRef<MemoEditorHandle | null>(null);
  const chat = useRef<MemoChatHandle | null>(null);
  const pageHandle = useRef<HtmlMemoPageHandle | null>(null);
  const [chatOpen, setChatOpen] = useSetting(MEMO_CHAT_OPEN);
  // 足す先のチャット（メインのチャット・メモのチャット）。本文の右クリック・見出しの添付のボタンから
  const file = `${dir}/${path}`;
  const targets = memoChatTargets({ file, path, attachTo, save: doc.save, memoChat: chat, openMemoChat: () => setChatOpen(true) });
  const editMenu = useMemoEditMenu(editor, targets, file);
  // チャットの欄の幅（境目のつまみで変える。本文を 280px は残す。ドラッグ中は本文と会話を並べる要素の --memo-chat-w を書き換える）。
  // 欄は閉じても描いたまま置き（書きかけの文も残る）、開け閉めは幅（狭いときは高さ）をスライドさせる
  const body = useRef<HTMLDivElement>(null);
  const chatPane = useRef<HTMLDivElement>(null);
  const chatWidth = useDragSize({ setting: MEMO_CHAT_WIDTH, edge: "start", min: 280, keep: 280, write: "--memo-chat-w", pane: chatPane, target: () => body.current });
  const savedTitle = memoTitle(path);
  // 書いている題名（別のメモへ移った・名前を変えたら、そのメモの題名に入れ直す）
  const [title, setTitle] = useState(savedTitle);
  useEffect(() => setTitle(savedTitle), [savedTitle]);
  const titleChanged = title.trim() !== "" && title.trim() !== savedTitle;
  // ⌘S・保存のボタン: 本文を保存してから、題名が変わっていればファイルの名前を変える
  const saveNow = () => {
    void doc.save().then(async (saved) => {
      if (!saved || !titleChanged) return;
      const to = await doc.rename(title.trim()).catch((e: unknown) => {
        reportFailure("名前を変えられませんでした")(e);
        return null;
      });
      if (to) onRenamed(to);
    });
  };
  // メモのチャットで送る前に、書きかけの本文を保存する（AI はファイルを読むので。保存できなければ送らない）
  const saveBeforeSend = async () => {
    if (!(await doc.save())) throw new Error("メモを保存できなかったので送りませんでした（ほかで変わっていれば、上の案内で読み直すか上書きしてから送ってください）");
  };
  // HTML のメモのページで、メモのフォルダの中へのリンクを押した
  const openLink = (to: string) => {
    const entry = list.data?.entries.find((e) => e.path === to);
    if (!entry) void alertDialog("リンク先が見つかりません", `メモのフォルダに「${to}」がありません。`);
    else if (!entry.dir && memoExtensionOf(to)) {
      if (to !== path) onOpenMemo(to);
    } else if (window.kickoff) void window.kickoff.externalApps.revealPath(`${dir}/${to}`);
  };
  const [view, setView] = useSetting(MEMO_VIEW);
  const kind = memoKindOf(path);
  // HTML のメモをページで見ているか（ページの中身は、いま書いてあるもの。表示を切り替えた・読み直したときに描き直す）
  const page = kind === "html" && view === "preview";
  const folder = parentOf(path);
  // 題名の後ろに続ける拡張子（題名 ＋ 拡張子 ＝ ファイル名）
  const extension = memoExtensionOf(path);
  const unreadable = doc.file && (doc.file.binary || doc.file.truncated);
  const unsaved = doc.state === "dirty" || doc.state === "conflict" || doc.state === "error" || titleChanged;

  return (
    <div className="memo-view">
      <header className="memo-head">
        <div className="memo-head-title">
          <input
            className="memo-title"
            value={title}
            maxLength={TITLE_MAX}
            spellCheck={false}
            aria-label="メモの名前（⌘S で保存）"
            title={`${path}（書き換えて ⌘S で名前を変える）`}
            onChange={(e) => setTitle(e.target.value)}
            // 本文と同じメニュー（切り取り・貼り付けはこの欄に効く。何も選んでいなければ、コピーは題名の全体）
            onContextMenu={(e) => {
              e.preventDefault();
              const input = e.currentTarget;
              const start = input.selectionStart ?? input.value.length;
              const end = input.selectionEnd ?? start;
              const value = input.value;
              editMenu.openFor(
                { x: e.clientX, y: e.clientY },
                {
                  text: value.slice(start, end),
                  copyAll: value,
                  insert: (text) => {
                    setTitle((value.slice(0, start) + text.replace(/\s*\n\s*/g, " ") + value.slice(end)).slice(0, TITLE_MAX));
                    input.focus();
                  },
                },
              );
            }}
            onKeyDown={(e) => {
              if (isComposing(e)) return;
              if (isKey(e, "s", { meta: true }) || isKey(e, "s", { ctrl: true }) || isKey(e, "Enter")) {
                e.preventDefault();
                saveNow();
              } else if (isCancelKey(e) && title !== savedTitle) {
                // 元の題名に戻す（右の欄を閉じる Esc には渡さない）
                e.preventDefault();
                e.stopPropagation();
                setTitle(savedTitle);
              }
            }}
          />
          {extension && <span className="memo-title-ext">{extension}</span>}
          {folder && <span className="memo-head-folder">{folder}</span>}
        </div>
        <span className={cx("memo-save-state", unsaved && "warn")} role="status">
          {doc.initial !== null && SAVE_LABELS[titleChanged && doc.state === "saved" ? "dirty" : doc.state]}
        </span>
        {doc.initial !== null && !unreadable && (
          <IconButton icon={Save} label="保存" keys="⌘S" disabled={(doc.state === "saved" && !titleChanged) || doc.state === "saving"} onClick={saveNow} />
        )}
        <Segmented
          className="view-toggle"
          label="メモの表示"
          value={view}
          onChange={setView}
          options={[
            // アイコンだけ（名前と説明は乗せたときに出す）。整えて見せる = 目、記号のまま = ソースの </>
            { value: "preview", label: VIEW_LABELS[kind].preview, icon: Eye, iconOnly: true },
            { value: "edit", label: VIEW_LABELS[kind].edit, icon: CodeXml, iconOnly: true },
          ]}
        />
        {targets.main && doc.initial !== null && !unreadable && (
          <IconButton icon={Paperclip} label="メインのチャットに添付" title="このメモを、開いたチャットの入力欄に添付します（送ると AI がメモを読み、頼めば続きも書けます）" onClick={() => targets.main?.add("", null)} />
        )}
        {doc.initial !== null && !unreadable && (
          <IconButton
            icon={MessagesSquare}
            label={chatOpen ? "メモのチャットを閉じる" : "メモのチャットを開く（AI と話しながらメモを作る）"}
            aria-pressed={chatOpen}
            className={cx("memo-chat-toggle", chatOpen && "on")}
            onClick={() => setChatOpen(!chatOpen)}
          />
        )}
        {window.kickoff && <IconButton icon={FolderSearch} label="Finder で表示" onClick={() => void window.kickoff?.externalApps.revealPath(file)} />}
        {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
        <PopOutTabButton />
      </header>
      {doc.state === "conflict" && (
        <div className="file-changed-notice" role="status">
          開いたあとで、ほかでこのメモが変わりました（チャットからの追記・ほかのアプリなど）。
          <button className="btn btn-sm" onClick={() => void doc.reload()}>
            読み直す（書いたものは捨てる）
          </button>
          <button className="btn btn-sm" onClick={doc.overwrite}>
            書いたもので上書き
          </button>
        </div>
      )}
      {doc.error && <ErrorText message={doc.error} className="memo-message" />}
      <div
        ref={body}
        className={cx("memo-body", !unreadable && doc.initial !== null && "with-chat", chatOpen && "chat-open", chatWidth.resizing && "resizing")}
        style={{ "--memo-chat-w": `${chatWidth.size}px` } as CSSProperties}
      >
        {doc.loadError ? (
          <ErrorText message={doc.loadError} className="memo-message" />
        ) : doc.initial === null ? (
          <p className="muted small memo-message">読み込み中…</p>
        ) : unreadable ? (
          <p className="muted small memo-message">{doc.file?.binary ? "文字のファイルではないので、ここでは開けません。Finder から開いてください。" : "大きすぎるので、ここでは開けません。"}</p>
        ) : (
          <>
            {page && <HtmlMemoPage projectId={projectId} path={path} html={doc.text() ?? doc.initial} onContextMenu={editMenu.open} onSave={saveNow} onOpenLink={openLink} handleRef={pageHandle} />}
            <Suspense fallback={<p className="muted small memo-message">編集の準備中…</p>}>
              <MemoEditor
                key={`${path}:${doc.revision}`}
                initialValue={doc.initial}
                kind={kind}
                live={view === "preview"}
                hidden={page}
                onChange={doc.change}
                onSave={saveNow}
                handleRef={editor}
                onContextMenu={editMenu.open}
              />
            </Suspense>
            {editMenu.element}
            {attachTo !== null && <MemoSelectionAttach chatId={attachTo} file={file} path={path} editor={editor} page={page ? pageHandle : null} />}
            {chatOpen && <div className="pane-resizer memo-chat-resizer" aria-label="メモのチャットの欄の幅を変える" {...chatWidth.handle} />}
            <div ref={chatPane} className="memo-chat-slot" aria-hidden={!chatOpen} inert={!chatOpen}>
              <MemoChat projectId={projectId} path={path} visible={chatOpen} beforeSend={saveBeforeSend} handleRef={chat} onClose={() => setChatOpen(false)} />
            </div>
          </>
        )}
      </div>
      {/* メモのチャットの欄を閉じている間は、ページの下にこのメモを AI に直してもらう入力欄（会話は出さず、様子の 1 行だけ） */}
      {doc.initial !== null && !unreadable && !chatOpen && <MemoQuickChat projectId={projectId} path={path} beforeSend={saveBeforeSend} onOpenChat={() => setChatOpen(true)} />}
    </div>
  );
}
