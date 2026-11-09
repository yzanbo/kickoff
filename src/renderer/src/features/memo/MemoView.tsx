import { CodeXml, Eye, Save } from "lucide-react";
import { memoExtensionOf, memoKindOf, type MemoKind } from "@shared/memo/kinds";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import { registerSavable } from "@/lib/saveAll";
import { isCancelKey, isComposing, isKey } from "@/lib/keys";
import { MEMO_CHAT_HEIGHT, MEMO_CHAT_OPEN, MEMO_CHAT_PLACE, MEMO_CHAT_WIDTH, MEMO_QUICK_CHAT_HIDDEN, MEMO_VIEW } from "@/lib/storageKeys";
import { useDragSize } from "@/hooks/useDragSize";
import { useSetting } from "@/hooks/useSetting";
import { useMemoList } from "@/stores/memos";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { AddToChat } from "@/ui/icons";
import { alertDialog, reportFailure } from "@/ui/dialogs";
import { Segmented } from "@/ui/Segmented";
import { usePageFind } from "@/ui/usePageFind";
import { openEditorFind } from "@/features/editor/editorFind";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { HtmlMemoPage, type HtmlMemoPageHandle } from "./HtmlMemoPage";
import type { MemoEditorHandle } from "./MemoEditor";
import { MemoChat, type MemoChatHandle } from "./MemoChat";
import { MemoQuickChat } from "./MemoQuickChat";
import { MemoChatToggle } from "./MemoChatToggle";
import { memoChatTargets } from "./memoChatTargets";
import { MemoSelectionAttach } from "./MemoSelectionAttach";
import { memoTitle, parentOf } from "./memoPaths";
import { subscribeMemoReveal, takeMemoReveal } from "./memoReveal";
import { useMemoDocument, type MemoSaveState } from "./useMemoDocument";
import { useBottomChatMotion } from "./useBottomChatMotion";
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
 * 開いているメモ（見出しに題名（すぐ後ろに拡張子を続け、ファイル名と同じに見せる）とフォルダ・保存の様子・保存・表示の切り替え。Finder で表示は、本文の右クリックとメモのタブの一覧の右クリックに）。
 * 表示は Markdown（Obsidian のライブプレビューと同じ。カーソルの行だけ記号を見せる）/ そのまま（記号もそのまま）。
 * HTML のメモ（.html）は、ページ（描いた見た目。書けない）/ ソース（HTML をそのまま書く）。ソースの編集の部品はページの間も隠して置く（元に戻す履歴を残す）。
 * 書いた所で ⌘S で保存する（書いている間は保存しない。まだ保存していない書きかけは残り、離れるときに聞く）。
 * 題名はいつでも書き換えられる欄（押せばそのままキャレットが入る。入力の画面に切り替えない）で、本文と同じく ⌘S（題名の欄では Enter も）で
 * 本文を保存してからファイルの名前を変える（onRenamed に変えたあとのパス。開いている側がパスを付け替える）。Esc で元の題名に戻す。
 * HTML のメモのページのリンクがメモのフォルダの中を指すとき、メモなら onOpenMemo（開いている側が同じ場所で開く）、フォルダ・メモでないファイルは Finder で表示する。
 * attachTo（チャットの右の欄・別ウィンドウで開いたとき、開いたチャット）があれば、見出しのボタン・本文の右クリックで、
 * メモ全体（選んでいれば、その部分の引用）をそのチャットの入力欄に添付する。本文で文を選ぶと、上のボタン（開いたチャット・メモのチャット。メモのタブではメモのチャットだけ）ですぐ引用を足せる。
 * メモのチャットの欄を閉じている間は、下にこのメモを AI に直してもらう入力欄（MemoQuickChat）を出す（隠すこともできる。MEMO_QUICK_CHAT_HIDDEN）
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
  // 欄を閉じている間、下の入力欄も隠す（メモだけを広く見る。見出しの吹き出しの ▾・入力欄の「隠す」）
  const [quickHidden, setQuickHidden] = useSetting(MEMO_QUICK_CHAT_HIDDEN);
  const quickFolded = chatOpen || quickHidden;
  // 欄を閉じている間は、メモのチャットの上のピルの列（指示の履歴・ToDo・サブエージェントなど）と送信待ちを下の入力欄の上に描く
  // （利用者の依頼: 会話の欄を閉じていても送信待ちを見せる。送信待ちがあれば、下の入力欄から送るものも送信待ちに足す）
  const [chipsHost, setChipsHost] = useState<HTMLDivElement | null>(null);
  const [queueHost, setQueueHost] = useState<HTMLDivElement | null>(null);
  const [queued, setQueued] = useState(false);
  const chipsPortal = useMemo(
    () => (chatOpen ? null : { target: chipsHost, queueTarget: queueHost, onQueued: setQueued, reveal: () => setChatOpen(true) }),
    [chatOpen, chipsHost, queueHost, setChatOpen],
  );
  // 足す先のチャット（開いたチャット・メモのチャット）。本文の右クリック・本文で選んだときの上のボタン・見出しの添付のボタンから
  const file = `${dir}/${path}`;
  const targets = memoChatTargets({ file, path, attachTo, save: doc.save, memoChat: chat, openMemoChat: () => setChatOpen(true) });
  const editMenu = useMemoEditMenu(editor, targets, file);
  // 頼まれた行へ移る（⌘K の「メモ内の文言」から。開いているときは知らせで、これから開くときは編集の部品ができたときに）
  const reveal = () => {
    if (!editor.current) return;
    const line = takeMemoReveal(projectId, path);
    if (line !== null) editor.current.revealLine(line);
  };
  // 編集の部品ができたときは、一拍おいてから受け取る（作ってすぐ作り直されることがある（開発の StrictMode）。古い部品で受け取って消さないように）
  const revealSoon = () => void setTimeout(reveal, 0);
  useEffect(() => subscribeMemoReveal(projectId, path, reveal), [projectId, path]);
  // チャットの欄の幅（境目のつまみで変える。本文を 280px は残す。ドラッグ中は本文と会話を並べる要素の --memo-chat-w を書き換える）。
  // 欄は閉じても描いたまま置き（書きかけの文も残る）、開け閉めは幅（下に置くときは高さ）をスライドさせる
  const body = useRef<HTMLDivElement>(null);
  // ⌘F（ピントが本文の外にあるとき）: 本文のエディタの検索の欄を開く（HTML のページで見ているときは、ページの外の文字を探す欄）
  const viewRef = useRef<HTMLDivElement>(null);
  const find = usePageFind(viewRef, { native: openEditorFind, placeholder: "このメモを検索", className: "page-find" });
  const chatPane = useRef<HTMLDivElement>(null);
  const chatWidth = useDragSize({ setting: MEMO_CHAT_WIDTH, edge: "start", min: 280, keep: 280, write: "--memo-chat-w", pane: chatPane, target: () => body.current });
  // 本文の下に置くとき（見出しで選ぶ）は、高さを本文と欄を合わせた高さの % で覚える（つまみは上下）
  const [chatPlace, setChatPlace] = useSetting(MEMO_CHAT_PLACE);
  const chatHeight = useDragSize({ setting: MEMO_CHAT_HEIGHT, axis: "y", edge: "start", unit: "%", min: 20, max: 85, write: "--memo-chat-h", pane: chatPane, target: () => body.current });
  const chatSize = chatPlace === "bottom" ? chatHeight : chatWidth;
  // 下に置いたときの開け閉めは、入力欄を下に止めたまま会話の部分だけを伸び縮みさせる（メモの下の入力欄の高さを測る）
  const motion = useBottomChatMotion(chatOpen, chatPlace === "bottom");
  const savedTitle = memoTitle(path);
  // 書いている題名（別のメモへ移った・名前を変えたら、そのメモの題名に入れ直す）
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
  // ⌘⇧S（すべて保存）で、まだ保存していなければ保存する（本文・題名。lib/saveAll）
  const savable = useRef({ unsaved, saveDoc });
  savable.current = { unsaved, saveDoc };
  useEffect(() => registerSavable({ dirty: () => savable.current.unsaved, save: () => savable.current.saveDoc() }), []);

  return (
    <div ref={viewRef} className="memo-view">
      {find}
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
          <IconButton icon={AddToChat} label={`${targets.main.name}に添付`} title="このメモを、開いたチャットの入力欄に添付します（送ると AI がメモを読み、頼めば続きも書けます）" onClick={() => targets.main?.add("", null)} />
        )}
        {doc.initial !== null && !unreadable && (
          <MemoChatToggle open={chatOpen} quickHidden={quickHidden} onOpenChange={setChatOpen} onQuickHiddenChange={setQuickHidden} />
        )}
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
        className={cx(
          "memo-body",
          !unreadable && doc.initial !== null && "with-chat",
          chatOpen && "chat-open",
          chatPlace === "bottom" && "chat-bottom",
          motion.moved && "chat-moved",
          chatSize.resizing && "resizing",
        )}
        style={{ "--memo-chat-w": `${chatWidth.size}px`, "--memo-chat-h": `${chatHeight.size}%`, "--memo-chat-h-num": chatHeight.size, "--memo-quick-h": `${quickHidden ? 0 : motion.quickHeight}px` } as CSSProperties}
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
                onReady={revealSoon}
              />
            </Suspense>
            {editMenu.element}
            <MemoSelectionAttach targets={targets} file={file} editor={editor} page={page ? pageHandle : null} />
            {chatOpen && (
              <div
                className={chatPlace === "bottom" ? "memo-chat-resizer-y" : "pane-resizer memo-chat-resizer"}
                aria-label={chatPlace === "bottom" ? "メモのチャットの欄の高さを変える" : "メモのチャットの欄の幅を変える"}
                {...chatSize.handle}
              />
            )}
            <div ref={chatPane} className="memo-chat-slot" aria-hidden={!chatOpen} inert={!chatOpen}>
              <MemoChat
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
        メモのチャットの欄を閉じている間は、ページの下にこのメモを AI に直してもらう入力欄（会話は出さず、様子の 1 行だけ）。
        欄を開いても描いたまま置き、欄が開くのと同じ動きで高さを畳む（すぐ消すと、欄が開ききるまでの間、入力欄のあった所が空いて見えた）。
        欄を下に置くときは、すぐ入れ替えて、欄をこの入力欄の高さから伸ばす（useBottomChatMotion）
      */}
      {doc.initial !== null && !unreadable && (
        <div className={cx("memo-quick-slot", quickFolded && "folded", chatPlace === "bottom" && "chat-bottom", motion.moved && "chat-moved")} aria-hidden={quickFolded} inert={quickFolded}>
          <div className="memo-quick-clip">
            <div ref={motion.quickRef}>
              <MemoQuickChat
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
