import { Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { cx } from "@/lib/cx";
import { lineCounts, lineDiff } from "@/lib/lineDiff";
import { MEMO_CHAT_APPLY, type MemoChatEntry } from "@/lib/storageKeys";
import { useEditKeys } from "@/hooks/useEditKeys";
import { useSetting } from "@/hooks/useSetting";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { Markdown } from "@/ui/markdown/Markdown";
import { confirmDialog } from "@/ui/dialogs";
import { Segmented } from "@/ui/Segmented";
import { ChangeCounts } from "@/features/chat/tools/TurnChanges";
import { MEMO_CHAT_PRESETS, type MemoChatState } from "./useMemoChat";

/**
 * メモの会話の欄（本文の右。狭いときは下）: メモについて AI と何往復も話し、変更の案が出たら差分を見て取り込む（取り込むまでメモは変わらない）。
 * 案の入れ方は見出しで選ぶ（承認 = 差分を見て「取り込む」/ 直接編集 = 届いたらすぐ本文に入れる。MEMO_CHAT_APPLY）。
 * 本文で範囲を選んでいれば、それを話の的として送る（入力の上に引用で見せ、× で外せる）。会話はメモごとに残る（useMemoChat）
 */
export function MemoChat({
  chat,
  selection,
  inputRef,
  onClose,
}: {
  chat: MemoChatState;
  /** 本文でいま選んでいる部分（なければ null） */
  selection: string | null;
  /** 入力の欄（選択の上の「AI と話す」で開いたとき、ここにピントを移す） */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [applyMode, setApplyMode] = useSetting(MEMO_CHAT_APPLY);
  // 選んでいる部分を話の的にしない（× で外した。選び直したら、また的にする）
  const [ignored, setIgnored] = useState<string | null>(null);
  const useSelection = selection !== null && selection !== ignored;
  const list = useRef<HTMLDivElement>(null);
  const send = (body: string) => {
    if (!body.trim() || chat.busy) return;
    chat.send(body, useSelection);
    setText("");
  };
  const keys = useEditKeys({ onSubmit: () => send(text) });

  // 新しい発言・返事が来たら、いちばん下を見せる
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.entries.length, chat.busy]);

  return (
    <aside className="memo-chat" aria-label="メモの会話">
      <header className="memo-chat-head">
        <Sparkles size={14} aria-hidden />
        <span className="memo-chat-title">メモの会話</span>
        <span className="spacer" />
        <Segmented
          className="segmented memo-chat-apply"
          label="変更の案の入れ方"
          value={applyMode}
          onChange={setApplyMode}
          options={[
            { value: "review", label: "承認", tip: "承認（AI の変更の案を差分で見て、「取り込む」を押したときだけ本文に入れる）" },
            { value: "direct", label: "直接編集", tip: "直接編集（AI の変更の案を、届いたらすぐ本文に入れる。⌘Z で戻せる。保存は ⌘S）" },
          ]}
        />
        <IconButton
          icon={Trash2}
          size={14}
          label="会話を消す（はじめから話す）"
          disabled={chat.entries.length === 0}
          onClick={() => void confirmDialog({ title: "このメモの会話を消しますか？", message: "メモの中身は変わりません。", confirmLabel: "消す" }).then((ok) => ok && chat.clear())}
        />
        <CloseButton size={15} label="会話の欄を閉じる" onClick={onClose} />
      </header>
      <div ref={list} className="memo-chat-list">
        {chat.entries.length === 0 && (
          <div className="memo-chat-empty muted small">
            <p>このメモについて、相談・アイデア出し・書き直しを頼めます。AI はいまのメモ（まだ保存していない書きかけも）を見て答えます。</p>
            <p>
              「反映して」と頼むと、メモの変更の案を出します。{applyMode === "review" ? "差分を見て「取り込む」まで、メモは変わりません。" : "直接編集なので、届いたらすぐ本文に入れます（⌘Z で戻せます）。"}
              保存は ⌘S です。本文で範囲を選ぶと、その部分についての話になります。
            </p>
          </div>
        )}
        {chat.entries.map((e, i) => (
          <ChatEntry key={i} entry={e} onApply={() => chat.apply(i)} />
        ))}
        {chat.busy && (
          <div className="memo-chat-busy" role="status">
            <Sparkles size={13} className="memo-ai-spin" aria-hidden />
            考えています…
            <button type="button" className="btn btn-sm" onClick={chat.cancel}>
              やめる
            </button>
          </div>
        )}
      </div>
      {chat.error && (
        <div className="memo-chat-error" role="alert">
          <span>{chat.error}</span>
          <CloseButton size={13} label="閉じる" onClick={chat.clearError} />
        </div>
      )}
      <div className="memo-chat-compose">
        {useSelection && (
          <div className="memo-chat-selection">
            <span className="muted small">選んだ部分（{selection.length} 文字）について</span>
            <IconButton icon={X} size={12} label="選んだ部分を話の的にしない（メモ全体の話にする）" onClick={() => setIgnored(selection)} />
            <blockquote className="memo-ai-quote">{selection}</blockquote>
          </div>
        )}
        <div className="memo-chat-presets">
          {MEMO_CHAT_PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-sm" title={p.text} disabled={chat.busy} onClick={() => send(p.text)}>
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          ref={inputRef}
          rows={3}
          className="memo-chat-input"
          value={text}
          placeholder="メモについて話す（例: 機能案を一緒に考えて / 優先度順に並べて反映して）。Enter で送る、Shift+Enter で改行"
          onChange={(e) => setText(e.target.value)}
          {...keys.keyProps}
        />
      </div>
    </aside>
  );
}

/** 会話の 1 件（自分の発言は吹き出し・選んでいた部分の引用、AI の返事は Markdown と変更の案） */
function ChatEntry({ entry, onApply }: { entry: MemoChatEntry; onApply: () => void }) {
  if (entry.role === "user") {
    return (
      <div className="memo-chat-user">
        {entry.selection && <blockquote className="memo-ai-quote">{entry.selection}</blockquote>}
        <div className="memo-chat-bubble">{entry.text}</div>
      </div>
    );
  }
  return (
    <div className={cx("memo-chat-reply", entry.error && "error")}>
      {entry.error ? <p className="memo-chat-error-text">{entry.text}</p> : <Markdown>{entry.text}</Markdown>}
      {entry.edit && <EditCard edit={entry.edit} onApply={onApply} />}
    </div>
  );
}

/** AI の変更の案（差分と「取り込む」。取り込んだら「取り込みました」） */
function EditCard({ edit, onApply }: { edit: NonNullable<MemoChatEntry["edit"]>; onApply: () => void }) {
  const diff = useMemo(() => lineDiff(edit.original, edit.text), [edit.original, edit.text]);
  return (
    <section className="memo-chat-edit" aria-label="メモの変更の案">
      <div className="memo-chat-edit-head">
        <span className="small">
          {edit.applied ? "入れた変更" : "変更の案"}（{edit.part ? "選んだ部分" : "メモ全体"}）
        </span>
        <ChangeCounts {...lineCounts(diff)} />
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-primary" disabled={edit.applied} title={edit.applied ? "本文に入れました（⌘Z で戻せます。保存は ⌘S）" : "本文を置き換えます（保存はしません。⌘Z で戻せます）"} onClick={onApply}>
          {edit.applied ? "取り込みました" : "取り込む"}
        </button>
      </div>
      <pre className="memo-ai-diff">
        {diff.map((d, i) => (
          <div key={i} className={cx("memo-ai-line", d.kind)}>
            <span className="memo-ai-mark" aria-hidden>
              {d.kind === "add" ? "+" : d.kind === "del" ? "−" : " "}
            </span>
            {d.text || " "}
          </div>
        ))}
      </pre>
    </section>
  );
}
