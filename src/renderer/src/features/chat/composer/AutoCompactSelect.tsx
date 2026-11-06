import { useId } from "react";
import { api } from "@/api";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { useAction } from "@/hooks/useAction";
import { formatTokens } from "@/lib/format";
import { ErrorText } from "@/ui/ErrorText";
import { AUTO_COMPACT_CHOICES, autoCompactThreshold } from "@shared/chat/autoCompact";

/**
 * チャット欄のメーターの詳細の「自動圧縮」: 自動圧縮を始める使用率を選ぶ（選んだらすぐ設定の auto_compact_pct に保存する。
 * 設定の「チャット」と同じ値で、どのチャットにも効く。効くのは次に送ったやり取りから）。選択肢には、このチャットの窓でのトークン数を添える。
 * 見出しを左・選択欄を右に置く 1 行（下の「圧縮前指示」の開閉の行とそろえる）。全チャット共通であることは見出しに乗せたときの説明で出す
 */
export function AutoCompactSelect({ windowSize }: { windowSize: number | null }) {
  const id = useId();
  const settings = useAppSettings().data;
  const action = useAction<"save">();
  const value = settings?.auto_compact_pct ?? null;
  const change = (pct: number | null) =>
    void action.run("save", async () => {
      settingsStore.set(await api.updateSettings({ auto_compact_pct: pct }));
    });
  return (
    <>
      <div className="context-auto-compact">
        <label htmlFor={id} data-tip="全チャット共通で、次のやり取りから効きます（設定の「チャット」と同じ値）">
          自動圧縮
        </label>
        <select id={id} value={value ?? ""} disabled={!settings || action.busy !== null} onChange={(e) => change(e.target.value ? Number(e.target.value) : null)}>
          <option value="">既定（上限の少し手前）</option>
          {AUTO_COMPACT_CHOICES.map((pct) => {
            const at = autoCompactThreshold(windowSize, pct);
            return (
              <option key={pct} value={pct}>
                {pct}% で始める{at !== null ? `（${formatTokens(at)}）` : ""}
              </option>
            );
          })}
        </select>
      </div>
      <ErrorText message={action.error} />
    </>
  );
}
