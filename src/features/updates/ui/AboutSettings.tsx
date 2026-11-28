import { RefreshCw } from "lucide-react";
import { applySettings, useAppSettings } from "@/foundation/ui/settings/appSettings";
import { useCell } from "@/foundation/ui/store/cell";
import { Field } from "@/foundation/ui/kit/Field";
import { SwitchField } from "@/foundation/ui/kit/ChoiceField";
import { buildLabel } from "@shared/updates/buildLabel";
import { RELEASES_URL } from "@shared/updates/distribution";
import { checkDisabled } from "@shared/updates/state";
import { updatesNative } from "./native";
import { updatesCell } from "./updatesStore";

/**
 * Kickoff について: 版・ビルド番号・短い SHA・作り方（手元ビルドか）と、新しい版を確かめる設定。
 * ブラウザで開いた画面には出さない（Mac のアプリの版を知らないため）
 */
export function AboutSettings() {
  const snapshot = useCell(updatesCell);
  const settings = useAppSettings().data;
  const busy = snapshot !== null && checkDisabled(snapshot.state);
  return (
    <section className="section">
      <h2>Kickoff について</h2>
      <div className="form">
        {snapshot ? (
          <Field as="div" label="版" help="ビルド番号はコミットの数です。手元ビルドは npm run install-app で作った版で、配った版と同じ番号でも中身が新しいことがあります。">
            <span>{buildLabel(snapshot.build)}</span>
          </Field>
        ) : (
          <p className="muted small">版はデスクトップアプリでだけ出します</p>
        )}
        {snapshot?.supported && settings && (
          <SwitchField
            label="新しい版を自動で確かめる"
            help="起動して少しあとと 1 時間ごとに確かめ、見つけたら裏でダウンロードして、左下の ⚙ に印を付けます。切っても、メニューの「Kickoff → アップデートを確認…」と下のボタンからは確かめられます。"
            checked={settings.auto_check_updates}
            onChange={(on) => applySettings({ auto_check_updates: on })}
            onLabel="確かめる"
            offLabel="確かめない"
          />
        )}
        {snapshot?.supported && (
          <div>
            <button type="button" className="btn" disabled={busy} onClick={updatesNative.check}>
              <RefreshCw size={14} aria-hidden />
              アップデートを確認
            </button>
          </div>
        )}
        {snapshot && !snapshot.supported && (
          <p className="muted small">
            この版（開発版・印鑑なしの手元ビルド）は新しい版を確かめません。配った版は{" "}
            <button type="button" className="link-button" onClick={() => updatesNative.openPage(RELEASES_URL)}>
              GitHub の Releases
            </button>{" "}
            から入れてください。
          </p>
        )}
      </div>
    </section>
  );
}
