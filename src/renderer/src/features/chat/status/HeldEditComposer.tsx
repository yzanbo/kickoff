import { useEffect, useRef, type KeyboardEvent, type MutableRefObject } from "react";
import { Pencil } from "lucide-react";
import type { Attachment, Chat } from "@shared/types";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";
import { api } from "@/api";
import { ApiError } from "@/api/http";
import { alertDialog } from "@/ui/dialogs";
import { isCancelKey } from "@/lib/keys";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { SnippetBar } from "@/features/snippet/SnippetBar";
import { endHeldEdit, type HeldEdit } from "./heldEdit";

/**
 * 預かった指示（「このやり取りが終わったら送ります」の吹き出し）を書き直すチャット欄。吹き出しの鉛筆で、ふつうのチャット欄と入れ替わって出る
 * （ふつうの欄は隠して残し、書きかけの文・添付はそのまま。終えたら戻る）。チャット欄と同じ部品なので、画像の添付・定型文・ほかのチャットの参照・
 * 音声入力がそのまま使える。保存（Enter・送信ボタン）すると、その吹き出しの中身だけを差し替え、送る順は変えない（api.updateAfterCompact）。
 * 書き直している間は、送る順が来てもその指示から後ろを送らずに待つ（api.setAfterCompactEditing を持ち時間の 1/4 ごとに知らせ直す。送信待ちの書き直しと同じ）。
 * やめる（帯のボタン・Esc）と何も変えずに戻る。保存する前に送られてしまった（持ち時間で外れた・消した）ときは、書いた文と添付をふつうのチャット欄に移す
 */
export function HeldEditComposer({ chat, edit, gone, composer }: { chat: Chat; edit: HeldEdit; gone: boolean; composer: MutableRefObject<ComposerHandle | null> }) {
  const handle = useRef<ComposerHandle | null>(null);
  // 書き直す文と添付を入れる（描いたあと、指示が替わったときだけ）
  useEffect(() => {
    handle.current?.fill(edit.text, { attachments: edit.attachments });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.id]);
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
    composer.current?.fill(text, { append: true, attachments });
    await alertDialog("この指示はもう送られていました", "書き直した文と添付は、チャット欄に移しました。");
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
        handleRef={handle}
        header={
          <>
            <div className={gone ? "held-edit-banner gone" : "held-edit-banner"}>
              <Pencil size={13} aria-hidden />
              <span className="held-edit-title">
                {gone ? "この指示はもう送られました。保存すると、書いた文をチャット欄に移します" : `預かった指示（${edit.position} 件目）を書き直しています。保存しても送る順はそのままです`}
              </span>
              <button type="button" className="btn btn-sm" onClick={cancel}>
                やめる
              </button>
            </div>
            {/* 定型文は書き直す欄に入れる（すぐ送るは、書き直しでは入れるだけ） */}
            <SnippetBar projectId={chat.project_id} composer={handle} onSend={async (text) => handle.current?.insert(text)} />
          </>
        }
      />
    </div>
  );
}
