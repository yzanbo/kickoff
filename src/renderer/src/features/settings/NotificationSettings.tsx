import { errorMessage } from "@shared/errors";
import { useAction } from "@/hooks/useAction";
import { Field } from "@/ui/Field";
import { ResultMessage, SaveActions } from "@/ui/SaveActions";
import { useSettingsDraft } from "./useSettingsDraft";

/** 設定: チャットの完了・失敗・回答待ちの知らせ方（Mac の通知・ntfy） */
export function NotificationSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  // テスト通知を送っている間と、その結果（届かなかったら理由。Mac の設定で許可していないときなど）
  const test = useAction<"send">();
  if (!draft) return null;
  const native = window.kickoff;
  const sendTest = async () => {
    if (!native) return;
    await test.run(
      "send",
      async () => {
        const result = await native.notify({ title: "Kickoff のテスト通知", body: "チャットの完了・失敗・回答待ちは、このように知らせます" }).catch((e: unknown) => ({ ok: false, error: errorMessage(e) }));
        if (!result.ok) throw new Error(`通知を出せませんでした（${result.error ?? "理由は不明"}）。Mac の通知の設定で Kickoff を許可してください`);
      },
      { done: "テスト通知を送りました。画面の右上に出ないときは、Mac の通知の設定で Kickoff を許可してください" },
    );
  };
  return (
    <section className="section">
      <h2>通知</h2>
      <div className="form">
        <label className="check">
          <input type="checkbox" checked={draft.desktop_notifications} onChange={(e) => setDraft({ ...draft, desktop_notifications: e.target.checked })} />
          <span>
            Mac の通知で知らせる
            <span className="field-help">
              チャットの完了・失敗・回答待ちを通知します。通知を押すと、そのチャットを開きます。Kickoff でそのチャットを見ているときは通知しません。
            </span>
          </span>
        </label>
        {/* Mac の通知が届くかを試す・Mac の設定（許可・バナーか通知パネルか・音）を開く（デスクトップアプリだけ） */}
        {native && (
          <div className="notification-test">
            <button type="button" className="btn" disabled={test.busy !== null} onClick={() => void sendTest()}>
              {test.busy ? "送信中…" : "テスト通知を送る"}
            </button>
            <button type="button" className="link-button" onClick={() => void native.openNotificationSettings()}>
              Mac の通知の設定を開く
            </button>
            <ResultMessage result={test.result} as="p" className="small" />
          </div>
        )}
        <Field label="ntfy のトピック URL（任意）" help="承認待ち・完了・失敗をスマホに通知します（M5 で対応）。">
          <input type="url" value={draft.ntfy_url} placeholder="https://ntfy.sh/your-topic" onChange={(e) => setDraft({ ...draft, ntfy_url: e.target.value })} />
        </Field>
      </div>
      <SaveActions save={save} disabled={!dirty} onSave={() => saveFields({ desktop_notifications: draft.desktop_notifications, ntfy_url: draft.ntfy_url.trim() })} />
    </section>
  );
}
