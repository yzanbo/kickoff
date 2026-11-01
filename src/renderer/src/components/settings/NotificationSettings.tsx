import { Field } from "../Field";
import { SaveActions } from "../SaveActions";
import { useSettingsDraft } from "./useSettingsDraft";

/** 設定: チャットの完了・失敗・回答待ちの知らせ方（Mac の通知・ntfy） */
export function NotificationSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  if (!draft) return null;
  return (
    <section className="section">
      <h2>通知</h2>
      <div className="form">
        <label className="check">
          <input type="checkbox" checked={draft.desktopNotifications} onChange={(e) => setDraft({ ...draft, desktopNotifications: e.target.checked })} />
          <span>
            Mac の通知で知らせる
            <span className="field-help">
              チャットの完了・失敗・回答待ちを通知します。通知を押すと、そのチャットを開きます。Kickoff でそのチャットを見ているときは通知しません。
            </span>
          </span>
        </label>
        <Field label="ntfy のトピック URL（任意）" help="承認待ち・完了・失敗をスマホに通知します（M5 で対応）。">
          <input type="url" value={draft.ntfyUrl} placeholder="https://ntfy.sh/your-topic" onChange={(e) => setDraft({ ...draft, ntfyUrl: e.target.value })} />
        </Field>
      </div>
      <SaveActions save={save} disabled={!dirty} onSave={() => saveFields({ desktopNotifications: draft.desktopNotifications, ntfyUrl: draft.ntfyUrl.trim() })} />
    </section>
  );
}
