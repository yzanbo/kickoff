import { useState } from "react";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useEditKeys } from "@/hooks/useEditKeys";
import { useModalDialog } from "@/hooks/useModalDialog";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { CheckField } from "@/ui/Field";
import { closeAskChild, useAskChildRequest, type AskChildRequest } from "./childChats";

/** 「子チャットで聞く」の画面（App と別ウィンドウに 1 つずつ置く。openAskChild で開く） */
export function AskChildHost() {
  const request = useAskChildRequest();
  // 開くたびに作り直す（前の質問・失敗の文を残さない）
  return request ? <AskChildDialog key={`${request.parentId}:${request.eventId}:${request.quote}`} request={request} /> : null;
}

/**
 * 子チャットで聞く: 選んだ文（引用）・聞くこと・「会話を引き継ぐ」（初めはオン）。聞くと子チャットが裏で動き始め、画面は変わらない
 * （親の会話の聞いた位置と入力欄の上に札が出て、答えが来たら点と通知で分かる）。Enter で聞く・Shift+Enter で改行・Esc でやめる
 */
function AskChildDialog({ request }: { request: AskChildRequest }) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const [text, setText] = useState("");
  const [inherit, setInherit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await api.createChildChat(request.parentId, { text: text.trim(), quote: request.quote || null, inherit, event_id: request.eventId });
      dialog.close();
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
        <h2 className="app-dialog-title">子チャットで聞く</h2>
        <p className="app-dialog-message">このチャットの作業を止めずに、横で聞きます。答えが来たら、聞いた位置と入力欄の上の札に印が付きます。</p>
        {request.quote && <blockquote className="ask-child-quote">{request.quote}</blockquote>}
        <textarea autoFocus rows={3} value={text} placeholder="聞きたいこと（Enter で聞く、Shift+Enter で改行）" onChange={(e) => setText(e.target.value)} {...keys.keyProps} />
        <CheckField
          label="会話を引き継ぐ"
          help="このチャットのいちばん新しい終わった作業までの会話を引き継ぎます（「これってどういう意味？」がそのまま通じます）。外すと、選んだ文と質問だけで始めます。"
          checked={inherit}
          onChange={setInherit}
        />
        <ErrorText message={error} />
        <DialogActions className="app-dialog-actions" onCancel={dialog.close} submit={{ label: "聞く", busyLabel: "始めています…", busy, disabled: !text.trim() }} />
      </form>
    </dialog>
  );
}
