import { AUTO_COMPACT_CHOICES } from "@shared/compact/autoCompact";
import { Field } from "@/foundation/ui/kit/Field";
import { applySettings, useAppSettings } from "@/foundation/ui/settings/appSettings";

/** 設定の「チャット」の欄: 自動圧縮を始める量（変えたらすぐ保存する） */
export function AutoCompactSetting() {
  const settings = useAppSettings().data;
  if (!settings) return null;
  return (
    <Field
      label="自動圧縮を始める量"
      help="コンテキストウィンドウをこの割合まで使ったら、Claude Code が会話を自動で要約してコンテキストを空けます（200k の窓で 50% なら 100k トークン）。早めにすると、長い作業でも上限の手前で慌てて圧縮せずに済みますが、要約の回数は増えます。次に送ったやり取りから効きます。チャット欄の円の外の矢印と、円を押した詳細の棒の縦線が、その位置です。円を押した詳細でも選べます。"
    >
      <select
        value={settings.auto_compact_pct ?? ""}
        onChange={(e) => applySettings({ auto_compact_pct: e.target.value ? Number(e.target.value) : null })}
      >
        {[null, ...AUTO_COMPACT_CHOICES].map((pct) => (
          <option key={pct ?? "default"} value={pct ?? ""}>
            {pct === null ? "Claude Code の既定（上限の少し手前）" : `コンテキストの ${pct}% を使ったら`}
          </option>
        ))}
      </select>
    </Field>
  );
}
