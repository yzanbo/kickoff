import "./NoteView.css";
import { StickyNote } from "lucide-react";
import { baseName } from "@shared/foundation/path";
import { noteKindOf } from "@shared/notes/kinds";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { registerUnsaved, useUnsavedSurface } from "@/foundation/ui/document/unsaved";
import { registerNoteSelection } from "@/features/userView/ui";
import { storage } from "@/features/notes/ui/storage";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { AddToChat } from "@/foundation/ui/kit/icons";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { usePageFind } from "@/foundation/ui/kit/usePageFind";
import { openEditorFind } from "@/foundation/ui/code/editorFind";
import { PopOutTabButton } from "@/features/panel/ui";
import { HtmlNotePage, type HtmlNotePageHandle } from "./HtmlNotePage";
import type { NoteEditorHandle } from "./NoteEditor";
import type { NoteChatHandle } from "@/features/notes/ui/chat/NoteChat";
import { NoteChatPane, NoteQuickSlot } from "@/features/notes/ui/chat/NoteChatPane";
import { NoteChatToggle } from "@/features/notes/ui/chat/NoteChatToggle";
import { useNoteChatLayout } from "@/features/notes/ui/chat/useNoteChatLayout";
import { useNoteChatTargets } from "./noteChatTargets";
import { NoteSelectionAttach } from "./NoteSelectionAttach";
import { noteTitle } from "@/features/notes/ui/notePaths";
import { subscribeNoteReveal, takeNoteReveal } from "@/features/notes/ui/noteReveal";
import { useNoteDocument } from "./useNoteDocument";
import { useNoteLinkOpener } from "./useNoteLinkOpener";
import { NoteImagesProvider } from "@/features/remoteImages/ui";
import { DocumentConflictBar } from "@/foundation/ui/document/DocumentConflictBar";
import { noteDocKey } from "@/features/notes/ui/noteLeave";
import { useNoteEditMenu } from "./useNoteEditMenu";
import { NoteSaveState, NoteViewToggle } from "./NoteHeadTools";
import { NoteTitleField } from "./NoteTitleField";

// 編集の部品（CodeMirror）は大きいので、ノートを開いたときに初めて読み込む
const NoteEditor = lazy(() => import("./NoteEditor"));

/**
 * 開いているノート（見出しに題名（すぐ後ろに拡張子を続け、ファイル名と同じに見せる）とフォルダ・保存の様子・保存・表示の切り替え。Finder で表示は、本文の右クリックとノートのタブの一覧の右クリックに）。
 * 表示は Markdown（Obsidian のライブプレビューと同じ。カーソルの行だけ記号を見せる）/ そのまま（記号もそのまま）。
 * HTML のノート（.html）は、ページ（描いた見た目。書けない）/ ソース（HTML をそのまま書く）。ソースの編集の部品はページの間も隠して置く（元に戻す履歴を残す）。
 * 書いた所で ⌘S で保存する（書いている間は保存しない。まだ保存していない書きかけは残り、離れるときに聞く）。
 * 題名はいつでも書き換えられる欄（押せばそのままキャレットが入る。入力の画面に切り替えない）で、本文と同じく ⌘S（題名の欄では Enter も）で
 * 本文を保存してからファイルの名前を変える（onRenamed に変えたあとのパス。開いている側がパスを付け替える）。Esc で元の題名に戻す。
 * HTML のノートのページのリンクがノートのフォルダの中を指すとき、ノートなら onOpenNote（開いている側が同じ場所で開く）、フォルダ・ノートでないファイルは Finder で表示する。
 * attachTo（チャットの右の欄・別ウィンドウで開いたとき、開いたチャット）があれば、見出しのボタン・本文の右クリックで、
 * ノート全体（選んでいれば、その部分の引用）をそのチャットの入力欄に追加する（ノート全体は押した時点の写しの札）。本文で文を選ぶと、上のボタン（開いたチャット・ノートのチャット。ノートのタブではノートのチャットだけ）ですぐ引用を足せる。
 * ノートのチャットの欄を閉じている間は、下にこのノートを AI に直してもらう入力欄（NoteQuickChat）を出す（隠すこともできる。storage.settings.quickChatHidden）
 */
export function NoteView({
  projectId,
  path,
  dir,
  onRenamed,
  onOpenNote,
  attachTo = null,
  onOpenInNoteTab,
}: {
  projectId: number;
  path: string;
  dir: string;
  onRenamed: (path: string) => void;
  onOpenNote: (path: string) => void;
  attachTo?: number | null;
  /** あれば見出しに「ノートのタブで開く」（DB クライアントの手順ノートのタブ） */
  onOpenInNoteTab?: () => void;
}) {
  const doc = useNoteDocument(projectId, path);
  // 編集の部品を外から動かす口（右クリックのメニュー）と、ノートのチャットの欄を動かす口（チャットに追加）
  const editor = useRef<NoteEditorHandle | null>(null);
  const chat = useRef<NoteChatHandle | null>(null);
  const pageHandle = useRef<HtmlNotePageHandle | null>(null);
  // ノートのチャットの欄の見え方（開閉・置き場所・大きさ・閉じている間のピルと送信待ち）
  const { body, pane: chatPane, quickRef, ...layout } = useNoteChatLayout();
  const { chatOpen, setChatOpen } = layout;
  // 足す先のチャット（開いたチャット・ノートのチャット）。本文の右クリック・本文で選んだときの上のボタン・見出しの「…に追加」のボタンから
  const file = `${dir}/${path}`;
  const targets = useNoteChatTargets({ projectId, file, path, attachTo, save: doc.save, noteChat: chat, openNoteChat: () => setChatOpen(true) });
  const editMenu = useNoteEditMenu(editor, targets, file, { projectId, body: () => doc.text() ?? "" });
  // 頼まれた行へ移る（⌘K の「ノート内の文言」から。開いているときは知らせで、これから開くときは編集の部品ができたときに）
  const reveal = () => {
    if (!editor.current) return;
    const line = takeNoteReveal(projectId, path);
    if (line !== null) editor.current.revealLine(line);
  };
  // 編集の部品ができたときは、一拍おいてから受け取る（作ってすぐ作り直されることがある（開発の StrictMode）。古い部品で受け取って消さないように）
  const revealSoon = () => void setTimeout(reveal, 0);
  useEffect(() => subscribeNoteReveal(projectId, path, reveal), [projectId, path]);
  // ⌘F（ピントが本文の外にあるとき）: 本文のエディタの検索の欄を開く（HTML のページで見ているときは、ページの外の文字を探す欄）
  const viewRef = useRef<HTMLDivElement>(null);
  const find = usePageFind(viewRef, { native: openEditorFind, placeholder: "このノートを検索", className: "page-find" });
  const savedTitle = noteTitle(path);
  // 書いている題名（別のノートへ移った・名前を変えたら、そのノートの題名に入れ直す）
  const [title, setTitle] = useState(savedTitle);
  useEffect(() => setTitle(savedTitle), [savedTitle]);
  const titleChanged = title.trim() !== "" && title.trim() !== savedTitle;
  // ⌘S・保存のボタン・⌘⇧S（すべて保存）: 本文を保存してから、題名が変わっていればファイルの名前を変える（保存できたかを返す）
  const saveDoc = async () => {
    if (!(await doc.save())) return false;
    if (!titleChanged) return true;
    const to = await doc.rename(title.trim()).catch((e: unknown) => {
      reportFailure("名前を変えられませんでした")(e);
      return null;
    });
    if (to) onRenamed(to);
    return Boolean(to);
  };
  const saveNow = () => void saveDoc();
  // ノートのチャットで送る前に、書きかけの本文を保存する（AI はファイルを読むので。保存できなければ送らない）
  const saveBeforeSend = async () => {
    if (!(await doc.save())) throw new Error("ノートを保存できなかったので送りませんでした（ほかで変わっていれば、上の案内で読み直すか上書きしてから送ってください）");
  };
  // リンクの開き方（Markdown のノートのリンクの小窓・⌘ ＋クリックと、HTML のノートのページでノートのフォルダの中へのリンクを押したとき）
  const links = useNoteLinkOpener({ projectId, path, dir, onOpenNote });
  const openLink = links.openInNotes;
  const [view, setView] = useSetting(storage.settings.view);
  const kind = noteKindOf(path);
  // HTML のノートをページで見ているか（ページの中身は、いま書いてあるもの。表示を切り替えた・読み直したときに描き直す）
  const page = kind === "html" && view === "preview";
  const unreadable = doc.file && (doc.file.binary || doc.file.truncated);
  // ⌘⇧S・離れる前の確かめで、題名の書き換えも数える（本文は useDocument が未保存の登録簿に出す。同じ key なので 1 度だけ聞く）
  const savable = useLatest({ titleChanged, saveDoc });
  const surface = useUnsavedSurface("notes");
  useEffect(() => registerUnsaved({ key: noteDocKey(projectId, path), surface, title: baseName(path), dirty: () => savable.current.titleChanged, save: () => savable.current.saveDoc() }), [projectId, path, surface]);
  // 選んでいる文（利用者が見ているものの知らせが読む。AI の get_user_view）
  useEffect(() => registerNoteSelection(projectId, path, () => editor.current?.selectedText() ?? ""), [projectId, path]);

  return (
    <div
      ref={viewRef}
      className="note-view"
      style={layout.findStyle}
    >
      {find}
      <header className="note-head bar">
        <NoteTitleField path={path} title={title} savedTitle={savedTitle} onTitle={setTitle} onSave={saveNow} editMenu={editMenu} />
        <NoteSaveState status={doc.status} titleChanged={titleChanged} shown={doc.initial !== null} savable={doc.initial !== null && !unreadable} onSave={saveNow} />
        <NoteViewToggle kind={kind} value={view} onChange={setView} />
        {targets.main && doc.initial !== null && !unreadable && (
          <IconButton icon={AddToChat} label={`${targets.main.name}に追加`} title="このノートの押した時点の中身を、開いたチャットの入力欄に札で足します（送ると AI が写しを読みます。元のノートを直してほしいときはそう頼んでください）" onClick={() => targets.main?.add("", null)} />
        )}
        {doc.initial !== null && !unreadable && (
          <NoteChatToggle open={chatOpen} quickHidden={layout.quickHidden} onOpenChange={setChatOpen} onQuickHiddenChange={layout.setQuickHidden} />
        )}
        {onOpenInNoteTab && <IconButton icon={StickyNote} label="ノートのタブで開く" title="このノートをプロジェクトの「ノート」タブで開きます" onClick={onOpenInNoteTab} />}
        {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
        <PopOutTabButton />
      </header>
      {doc.status === "conflict" && (
        <DocumentConflictBar onReload={() => void doc.reload()} onOverwrite={() => void doc.save({ force: true })}>
          開いたあとで、ほかでこのノートが変わりました（チャットからの追記・ほかのアプリなど）。
        </DocumentConflictBar>
      )}
      {doc.saveError && <ErrorText message={doc.saveError} className="note-message" />}
      <div
        ref={body}
        className={cx("note-body", !unreadable && doc.initial !== null && "with-chat", layout.bodyClassName)}
        style={layout.bodyStyle}
      >
        {doc.loadError ? (
          <ErrorText message={doc.loadError} className="note-message" />
        ) : doc.initial === null ? (
          <p className="muted small note-message">読み込み中…</p>
        ) : unreadable ? (
          <p className="muted small note-message">{doc.file?.binary ? "文字のファイルではないので、ここでは開けません。Finder から開いてください。" : "大きすぎるので、ここでは開けません。"}</p>
        ) : (
          <>
            {page && <HtmlNotePage projectId={projectId} path={path} html={doc.text() ?? doc.initial} onContextMenu={editMenu.open} onSave={saveNow} onOpenLink={openLink} handleRef={pageHandle} />}
            {/* 画像の描き方（ノートのフォルダの中はそのまま・外の画像は押して許可したホストだけ。許可はノートごと） */}
            <NoteImagesProvider projectId={projectId} path={path} localUrl={links.imageUrl}>
              <Suspense fallback={<p className="muted small note-message">編集の準備中…</p>}>
                <NoteEditor
                  key={`${path}:${doc.revision}`}
                  initialValue={doc.initial}
                  kind={kind}
                  preview={view === "preview"}
                  hidden={page}
                  onChange={doc.setText}
                  onSave={saveNow}
                  handleRef={editor}
                  onContextMenu={editMenu.open}
                  onReady={revealSoon}
                  linkOpener={links.opener}
                />
              </Suspense>
            </NoteImagesProvider>
            {editMenu.element}
            <NoteSelectionAttach targets={targets} file={file} editor={editor} page={page ? pageHandle : null} />
            <NoteChatPane layout={layout} paneRef={chatPane} projectId={projectId} path={path} beforeSend={saveBeforeSend} handleRef={chat} />
          </>
        )}
      </div>
      {doc.initial !== null && !unreadable && <NoteQuickSlot layout={layout} quickRef={quickRef} projectId={projectId} path={path} beforeSend={saveBeforeSend} />}
    </div>
  );
}
