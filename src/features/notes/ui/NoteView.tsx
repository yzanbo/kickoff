import { CodeXml, Eye, Save, StickyNote } from "lucide-react";
import { noteExtensionOf, noteKindOf, type NoteKind } from "@shared/notes/kinds";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { registerUnsaved } from "@/foundation/ui/document/unsaved";
import { registerNoteSelection } from "@/foundation/ui/lib/viewDetails";
import { isCancelKey, isComposing, isKey } from "@/foundation/ui/lib/keys";
import { storage } from "./storage";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useNoteList } from "@/features/notes/ui/stores/notes";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { AddToChat } from "@/foundation/ui/kit/icons";
import { alert, reportFailure } from "@/foundation/ui/kit/ask";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { usePageFind } from "@/foundation/ui/kit/usePageFind";
import { openEditorFind } from "@/foundation/ui/code/editorFind";
import { PopOutTabButton } from "@/features/panel/ui/tabs/PopOutTabButton";
import { HtmlNotePage, type HtmlNotePageHandle } from "./HtmlNotePage";
import type { NoteEditorHandle } from "./NoteEditor";
import { NoteChat, type NoteChatHandle } from "./NoteChat";
import { NoteQuickChat } from "./NoteQuickChat";
import { NoteChatToggle } from "./NoteChatToggle";
import { useNoteChatTargets } from "./noteChatTargets";
import { NoteSelectionAttach } from "./NoteSelectionAttach";
import { baseName, noteTitle, parentOf } from "./notePaths";
import { subscribeNoteReveal, takeNoteReveal } from "./noteReveal";
import { useNoteDocument, type NoteSaveState } from "./useNoteDocument";
import { useBottomChatMotion } from "./useBottomChatMotion";
import { useNoteEditMenu } from "./useNoteEditMenu";
import { openExternal } from "@/foundation/ui/external/native";

// 編集の部品（CodeMirror）は大きいので、ノートを開いたときに初めて読み込む
const NoteEditor = lazy(() => import("./NoteEditor"));

/** 題名の欄に書ける長さ（文字） */
const TITLE_MAX = 120;

/** 表示の切り替えの説明（種類ごと。preview = 整えて見せる / edit = 中身をそのまま） */
const VIEW_LABELS: Record<NoteKind, { preview: string; edit: string }> = {
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
const SAVE_LABELS: Record<NoteSaveState, string> = {
  saved: "保存済み",
  dirty: "未保存（⌘S で保存）",
  saving: "保存中…",
  conflict: "ほかで変わりました",
  error: "保存できませんでした",
};

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
  const list = useNoteList(projectId);
  // 編集の部品を外から動かす口（右クリックのメニュー）と、ノートのチャットの欄を動かす口（チャットに追加）
  const editor = useRef<NoteEditorHandle | null>(null);
  const chat = useRef<NoteChatHandle | null>(null);
  const pageHandle = useRef<HtmlNotePageHandle | null>(null);
  const [chatOpen, setChatOpen] = useSetting(storage.settings.chatOpen);
  // 欄を閉じている間、下の入力欄も隠す（ノートだけを広く見る。見出しの吹き出しの ▾・入力欄の「隠す」）
  const [quickHidden, setQuickHidden] = useSetting(storage.settings.quickChatHidden);
  const quickFolded = chatOpen || quickHidden;
  // 欄を閉じている間は、ノートのチャットの上のピルの列（指示の履歴・ToDo・サブエージェントなど）と送信待ちを下の入力欄の上に描く（会話の欄を閉じていても送信待ちを見せる。送信待ちがあれば、下の入力欄から送るものも送信待ちに足す）
  const [chipsHost, setChipsHost] = useState<HTMLDivElement | null>(null);
  const [queueHost, setQueueHost] = useState<HTMLDivElement | null>(null);
  const [queued, setQueued] = useState(false);
  const chipsPortal = useMemo(
    () => (chatOpen ? null : { target: chipsHost, queueTarget: queueHost, onQueued: setQueued, reveal: () => setChatOpen(true) }),
    [chatOpen, chipsHost, queueHost, setChatOpen],
  );
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
  // チャットの欄の幅（境目のつまみで変える。本文を 280px は残す。ドラッグ中は本文と会話を並べる要素の --note-chat-w を書き換える）。
  // 欄は閉じても描いたまま置き（書きかけの文も残る）、開け閉めは幅（下に置くときは高さ）をスライドさせる
  const body = useRef<HTMLDivElement>(null);
  // ⌘F（ピントが本文の外にあるとき）: 本文のエディタの検索の欄を開く（HTML のページで見ているときは、ページの外の文字を探す欄）
  const viewRef = useRef<HTMLDivElement>(null);
  const find = usePageFind(viewRef, { native: openEditorFind, placeholder: "このノートを検索", className: "page-find" });
  const chatPane = useRef<HTMLDivElement>(null);
  const chatWidth = useDragSize({ setting: storage.settings.chatWidth, edge: "start", min: 280, keep: 280, write: "--note-chat-w", pane: chatPane, target: () => body.current });
  // 本文の下に置くとき（見出しで選ぶ）は、高さを本文と欄を合わせた高さの % で覚える（つまみは上下）
  const [chatPlace, setChatPlace] = useSetting(storage.settings.chatPlace);
  const chatHeight = useDragSize({ setting: storage.settings.chatHeight, axis: "y", edge: "start", unit: "%", min: 20, max: 85, write: "--note-chat-h", pane: chatPane, target: () => body.current });
  const chatSize = chatPlace === "bottom" ? chatHeight : chatWidth;
  // 下に置いたときの開け閉めは、入力欄を下に止めたまま会話の部分だけを伸び縮みさせる（ノートの下の入力欄の高さを測る）
  const { quickRef: motionQuickRef, ...motion } = useBottomChatMotion(chatOpen, chatPlace === "bottom");
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
  // HTML のノートのページで、ノートのフォルダの中へのリンクを押した
  const openLink = (to: string) => {
    const entry = list.data?.entries.find((e) => e.path === to);
    if (!entry) void alert("リンク先が見つかりません", `ノートのフォルダに「${to}」がありません。`);
    else if (!entry.dir && noteExtensionOf(to)) {
      if (to !== path) onOpenNote(to);
    } else void openExternal({ kind: "reveal", path: `${dir}/${to}` });
  };
  const [view, setView] = useSetting(storage.settings.view);
  const kind = noteKindOf(path);
  // HTML のノートをページで見ているか（ページの中身は、いま書いてあるもの。表示を切り替えた・読み直したときに描き直す）
  const page = kind === "html" && view === "preview";
  const folder = parentOf(path);
  // 題名の後ろに続ける拡張子（題名 ＋ 拡張子 ＝ ファイル名）
  const extension = noteExtensionOf(path);
  const unreadable = doc.file && (doc.file.binary || doc.file.truncated);
  const unsaved = doc.state === "dirty" || doc.state === "conflict" || doc.state === "error" || titleChanged;
  // ⌘⇧S（すべて保存）で、まだ保存していなければ保存する（本文・題名。未保存の登録簿 document/unsaved）
  const savable = useLatest({ unsaved, saveDoc });
  useEffect(() => registerUnsaved({ key: `${projectId}:${path}`, surface: "notes", title: baseName(path), dirty: () => savable.current.unsaved, save: () => savable.current.saveDoc() }), [projectId, path]);
  // 選んでいる文（利用者が見ているものの知らせが読む。AI の get_user_view）
  useEffect(() => registerNoteSelection(projectId, path, () => editor.current?.selectedText() ?? ""), [projectId, path]);

  return (
    <div
      ref={viewRef}
      className="note-view"
      // ⌘F の検索の欄は本文の右上に出す（右にノートのチャットを開いていれば、その欄の見出しを隠さないよう左へずらす）
      style={chatOpen && chatPlace !== "bottom" ? ({ "--note-find-right": `${chatWidth.size}px` } as CSSProperties) : undefined}
    >
      {find}
      <header className="note-head bar">
        <div className="note-head-title">
          <input
            className="note-title"
            value={title}
            maxLength={TITLE_MAX}
            spellCheck={false}
            aria-label="ノートの名前（⌘S で保存）"
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
          {extension && <span className="note-title-ext">{extension}</span>}
          {folder && <span className="note-head-folder">{folder}</span>}
        </div>
        <span className={cx("note-save-state", unsaved && "warn")} role="status">
          {doc.initial !== null && SAVE_LABELS[titleChanged && doc.state === "saved" ? "dirty" : doc.state]}
        </span>
        {doc.initial !== null && !unreadable && (
          <IconButton icon={Save} label="保存" keys="⌘S" disabled={(doc.state === "saved" && !titleChanged) || doc.state === "saving"} onClick={saveNow} />
        )}
        <Segmented
          look="toggle"
          label="ノートの表示"
          value={view}
          onChange={setView}
          options={[
            // アイコンだけ（名前と説明は乗せたときに出す）。整えて見せる = 目、記号のまま = ソースの </>
            { value: "preview", label: VIEW_LABELS[kind].preview, icon: Eye, iconOnly: true },
            { value: "edit", label: VIEW_LABELS[kind].edit, icon: CodeXml, iconOnly: true },
          ]}
        />
        {targets.main && doc.initial !== null && !unreadable && (
          <IconButton icon={AddToChat} label={`${targets.main.name}に追加`} title="このノートの押した時点の中身を、開いたチャットの入力欄に札で足します（送ると AI が写しを読みます。元のノートを直してほしいときはそう頼んでください）" onClick={() => targets.main?.add("", null)} />
        )}
        {doc.initial !== null && !unreadable && (
          <NoteChatToggle open={chatOpen} quickHidden={quickHidden} onOpenChange={setChatOpen} onQuickHiddenChange={setQuickHidden} />
        )}
        {onOpenInNoteTab && <IconButton icon={StickyNote} label="ノートのタブで開く" title="このノートをプロジェクトの「ノート」タブで開きます" onClick={onOpenInNoteTab} />}
        {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
        <PopOutTabButton />
      </header>
      {doc.state === "conflict" && (
        <div className="file-changed-notice" role="status">
          開いたあとで、ほかでこのノートが変わりました（チャットからの追記・ほかのアプリなど）。
          <button className="btn" data-size="sm" onClick={() => void doc.reload()}>
            読み直す（書いたものは捨てる）
          </button>
          <button className="btn" data-size="sm" onClick={doc.overwrite}>
            書いたもので上書き
          </button>
        </div>
      )}
      {doc.error && <ErrorText message={doc.error} className="note-message" />}
      <div
        ref={body}
        className={cx(
          "note-body",
          !unreadable && doc.initial !== null && "with-chat",
          chatOpen && "chat-open",
          chatPlace === "bottom" && "chat-bottom",
          motion.moved && "chat-moved",
          chatSize.resizing && "resizing",
        )}
        style={{ "--note-chat-w": `${chatWidth.size}px`, "--note-chat-h": `${chatHeight.size}%`, "--note-chat-h-num": chatHeight.size, "--note-quick-h": `${quickHidden ? 0 : motion.quickHeight}px` } as CSSProperties}
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
            <Suspense fallback={<p className="muted small note-message">編集の準備中…</p>}>
              <NoteEditor
                key={`${path}:${doc.revision}`}
                initialValue={doc.initial}
                kind={kind}
                live={view === "preview"}
                hidden={page}
                onChange={doc.change}
                onSave={saveNow}
                handleRef={editor}
                onContextMenu={editMenu.open}
                onReady={revealSoon}
              />
            </Suspense>
            {editMenu.element}
            <NoteSelectionAttach targets={targets} file={file} editor={editor} page={page ? pageHandle : null} />
            {chatOpen && (
              <div
                className={chatPlace === "bottom" ? "pane-resizer-y" : "pane-resizer note-chat-resizer"}
                aria-label={chatPlace === "bottom" ? "ノートのチャットの欄の高さを変える" : "ノートのチャットの欄の幅を変える"}
                {...chatSize.handle}
              />
            )}
            <div ref={chatPane} className={cx("note-chat-slot slide-pane", chatOpen && "open", chatSize.resizing && "resizing")} data-size="outer" data-axis={chatPlace === "bottom" ? undefined : "x"} aria-hidden={!chatOpen} inert={!chatOpen}>
              <NoteChat
                projectId={projectId}
                path={path}
                visible={chatOpen}
                beforeSend={saveBeforeSend}
                handleRef={chat}
                place={chatPlace}
                onPlaceChange={setChatPlace}
                onHide={() => {
                  setQuickHidden(true);
                  setChatOpen(false);
                }}
                onQuickOnly={() => {
                  setQuickHidden(false);
                  setChatOpen(false);
                }}
                chipsPortal={chipsPortal}
              />
            </div>
          </>
        )}
      </div>
      {/*
        ノートのチャットの欄を閉じている間は、ページの下にこのノートを AI に直してもらう入力欄（会話は出さず、様子の 1 行だけ）。
        欄を開いても描いたまま置き、欄が開くのと同じ動きで高さを畳む（すぐ消すと、欄が開ききるまでの間、入力欄のあった所が空いて見えた）。
        欄を下に置くときは、すぐ入れ替えて、欄をこの入力欄の高さから伸ばす（useBottomChatMotion）
      */}
      {doc.initial !== null && !unreadable && (
        <div className={cx("note-quick-slot", quickFolded && "folded", chatPlace === "bottom" && "chat-bottom", motion.moved && "chat-moved")} aria-hidden={quickFolded} inert={quickFolded}>
          <div className="note-quick-clip">
            <div ref={motionQuickRef}>
              <NoteQuickChat
                projectId={projectId}
                path={path}
                beforeSend={saveBeforeSend}
                onOpenChat={() => setChatOpen(true)}
                onHide={() => setQuickHidden(true)}
                chipsRef={setChipsHost}
                queueRef={setQueueHost}
                queued={queued}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
