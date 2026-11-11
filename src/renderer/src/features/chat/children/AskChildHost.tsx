import { useLayoutEffect, useRef, useState } from "react";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useEditKeys } from "@/hooks/useEditKeys";
import { useModalDialog } from "@/hooks/useModalDialog";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import { closeAskChild, useAskChildRequest, type AskChildRequest } from "./childChats";
import { openCreatedChild } from "./openChild";
import { InheritChoice } from "./InheritChoice";

/** 「新しい子チャットで聞く」の画面（App と別ウィンドウに 1 つずつ置く。openAskChild で開く） */
export function AskChildHost() {
  const request = useAskChildRequest();
  // 開くたびに作り直す（前の質問・失敗の文を残さない）
  return request ? <AskChildDialog key={`${request.parentId}:${request.eventId}:${request.quote}`} request={request} /> : null;
}

/** 聞く欄に初めから入れておく文（選んだ文の引用と、その下に書き始める空行） */
const initialText = (quote: string) => (quote.trim() ? `${quoteComment(quote, "")}\n\n` : "");

/**
 * 子チャットで聞く: 聞く欄（選んだ文を引用（`> `）にして初めから入れておき、書き換えられる。キャレットは引用の下）・「会話を引き継ぐ / 新しく始める」（初めは引き継ぐ）。
 * 聞くと子チャットが動き始め、設定の「子チャットを作ったとき」（右の欄 / 別ウィンドウ / 開かない）で開く（親の会話の聞いた位置と入力欄の上に札が出て、答えが来たら点と通知で分かる）。
 * 引き継ぐを選んでいる間は、切り替えの右の「引き継いで開く」で、聞くことなしで会話を引き継いだ子チャットを開くだけにもできる（設定が「開かない」でも開く）。
 * Enter で聞く・Shift+Enter で改行・Esc でやめる
 */
function AskChildDialog({ request }: { request: AskChildRequest }) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const [text, setText] = useState(() => initialText(request.quote));
  const [inherit, setInherit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 開いたら、引用の下（文の終わり）から書き始められるようにする
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    input.scrollTop = input.scrollHeight;
  }, []);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      // 選んだ文は聞く欄の中にあるので、別には送らない（書き換えたものをそのまま送る）
      const child = await api.createChildChat(request.parentId, { text: text.trim(), quote: null, inherit, event_id: request.eventId });
      dialog.close();
      openCreatedChild(child);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  // 聞くことなしで、このチャットの会話を引き継いだ子チャットを開くだけ（書いた文があっても送らない）
  const openOnly = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const child = await api.createChildChat(request.parentId, { text: "", quote: null, inherit: true, event_id: request.eventId });
      dialog.close();
      openCreatedChild(child, { always: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const keys = useEditKeys({ onSubmit: () => void submit() });
  return (
    <dialog ref={dialog.ref} className="dialog app-dialog ask-child" onClose={closeAskChild}>
      <form
        className="app-dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="app-dialog-title">新しい子チャットで聞く</h2>
        <p className="app-dialog-message">
          このチャットの作業を止めずに、横で聞きます。答えが来たら、聞いた位置と入力欄の上の札に印が付きます。
          {request.quote.trim() && "選択部分は引用として入れてあります。書き換えたり、消したりできます。"}
        </p>
        {/* 会話を引き継ぐか（初めは引き継ぐ。新しい子チャットのタブと同じく聞く欄のすぐ上） */}
        <InheritChoice inherit={inherit} onChange={setInherit} parentLabel="このチャット" onOpen={() => void openOnly()} opening={busy} />
        <textarea
          ref={inputRef}
          className="ask-child-input"
          rows={3}
          value={text}
          placeholder="聞きたいこと（Enter で聞く、Shift+Enter で改行）"
          onChange={(e) => setText(e.target.value)}
          {...keys.keyProps}
        />
        <ErrorText message={error} />
        <DialogActions className="app-dialog-actions" onCancel={dialog.close} submit={{ label: "聞く", busyLabel: "始めています…", busy, disabled: !text.trim() }} />
      </form>
    </dialog>
  );
}
