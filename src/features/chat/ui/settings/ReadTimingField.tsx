import { READ_TIMING_LABELS, READ_TIMINGS, type ReadTiming } from "@shared/chat/readTiming";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";
import { applySettings, useAppSettings } from "@/foundation/ui/settings/appSettings";

/**
 * 設定の「チャット」の「既読にするタイミング」（一番下まで見たら既読 / 一番下まで見て、ボタンで既読。選んだらすぐ保存する）。
 * コアの設定なので、スマホも同じものに従う
 */
export function ReadTimingField() {
  const value = useAppSettings().data?.read_timing;
  if (!value) return null;
  return (
    <ChoiceField<ReadTiming>
      label="既読にするタイミング"
      help="AI の作業が終わったチャットを、未読から既読に変えるときです（スマホも同じ。選んだらすぐ反映）。作業が終わると、見ていても必ず未読になります。「一番下まで見たら既読」は、一番下が見えている間にスクロール・クリック・キー入力したら既読にします。「一番下まで見て、ボタンで既読」は、一番下まで来ると入力欄の上に出る「既読にする」を押したら既読にします（既読になると、同じ場所に「既読」と出ます）。どちらも返信を送る・⌘⇧U・右クリックの「既読にする」で既読になります。"
      value={value}
      onChange={(next) => applySettings({ read_timing: next })}
      options={READ_TIMINGS.map((timing) => ({ value: timing, label: READ_TIMING_LABELS[timing] }))}
    />
  );
}
