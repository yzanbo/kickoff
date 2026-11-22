import { useEffect, useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import type { Attachment, Chat } from "@shared/chat/types";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";
import { api } from "@/foundation/ui/api";
import { ApiError } from "@/foundation/ui/api/http";
import { alert } from "@/foundation/ui/kit/ask";
import { isCancelKey } from "@/foundation/ui/lib/keys";
import { Composer } from "@/features/composer/ui/Composer";
import { appendToDraft, focusDraft, memoryDraft } from "@/features/composer/ui";
import { SnippetBar } from "@/features/snippets/ui/SnippetBar";
import { endHeldEdit, type HeldEdit } from "./heldEdit";

/**
 * 預かった指示（「このやり取りが終わったら送ります」の吹き出し）を書き直すチャット欄。吹き出しの鉛筆で、ふつうのチャット欄と入れ替わって出る
 * （ふつうの欄は隠して残し、書きかけの文・添付はそのまま。終えたら戻る）。チャット欄と同じ部品なので、画像の添付・定型文・ほかのチャットの参照・
 * 音声入力がそのまま使える。保存（Enter・送信ボタン）すると、その吹き出しの中身だけを差し替え、送る順は変えない（api.updateAfterCompact）。
 * 書き直している間は、送る順が来てもその指示から後ろを送らずに待つ（api.setAfterCompactEditing を持ち時間の 1/4 ごとに知らせ直す。送信待ちの書き直しと同じ）。
 * やめる（帯のボタン・Esc）と何も変えずに戻る。保存する前に送られてしまった（持ち時間で外れた・消した）ときは、書いた文と添付をふつうのチャット欄に移す
 */
export function HeldEditComposer({ chat, edit, gone }: { chat: Chat; edit: HeldEdit; gone: boolean }) {
  // 書き直す文と添付（指示が替わったら、その指示の中身で作り直す。残さない）
  const [draft, setDraft] = useState(() => memoryDraft({ text: edit.text, attachments: edit.attachments }));
  const [draftOf, setDraftOf] = useState(edit.id);
  if (draftOf !== edit.id) {
    setDraftOf(edit.id);
    setDraft(memoryDraft({ text: edit.text, attachments: edit.attachments }));
  }
  // 入れたら文の終わりにピントを置く
  useEffect(() => focusDraft(draft, { end: true }), [draft]);
  // 書き直している間は送らずに待つよう知らせ続け、終えたら外す
  useEffect(() => {
    const tell = (ids: string[]) => void api.setAfterCompactEditing(chat.id, ids).catch(() => undefined);
    tell([edit.id]);
    const timer = setInterval(() => tell([edit.id]), EDIT_HOLD_TTL_MS / 4);
    return () => {
      clearInterval(timer);
      tell([]);
    };
  }, [chat.id, edit.id]);

  const cancel = () => endHeldEdit(chat.id);
  /** もう送られていた: 書いたものをふつうのチャット欄に移す（新しい指示として送り直せる） */
  const moveToComposer = async (text: string, attachments: Attachment[]) => {
    endHeldEdit(chat.id);
    appendToDraft(chat.id, text, attachments);
    await alert("この指示はもう送られていました", "書き直した文と添付は、チャット欄に移しました。");
  };
  const save = async (text: string, attachments: Attachment[]) => {
    if (gone) return moveToComposer(text, attachments);
    try {
      await api.updateAfterCompact(chat.id, edit.id, text, attachments);
      endHeldEdit(chat.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return moveToComposer(text, attachments);
      throw e;
    }
  };
  // Esc でやめる（候補の一覧・録音など、チャット欄が先に使った Esc は見ない）
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || !isCancelKey(e)) return;
    e.preventDefault();
    cancel();
  };
  return (
    <div className="held-edit" onKeyDown={onKeyDown}>
      <Composer
        autoFocus
        chatContext={{ projectId: chat.project_id, exclude: chat.id }}
        placeholder="書き直す文（Enter で保存・Esc でやめる）"
        sendLabel="保存（送る順はそのまま）"
        onSend={save}
        suggestTarget={{ projectId: chat.project_id, worktree: chat.worktree_path ?? undefined }}
        draft={draft}
        header={
          <>
            <div className={gone ? "held-edit-banner gone" : "held-edit-banner"}>
              <Pencil size={13} aria-hidden />
              <span className="held-edit-title">
                {gone ? "この指示はもう送られました。保存すると、書いた文をチャット欄に移します" : `預かった指示（${edit.position} 件目）を書き直しています。保存しても送る順はそのままです`}
              </span>
              <button type="button" className="btn" data-size="sm" onClick={cancel}>
                やめる
              </button>
            </div>
            {/* 定型文は書き直す欄に入れる（すぐ送るは、書き直しでは入れるだけ） */}
            <SnippetBar projectId={chat.project_id} />
          </>
        }
      />
    </div>
  );
}
