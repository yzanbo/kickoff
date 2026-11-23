// 設定の「ゴミ箱と整理」の節: 中身は持ち主が settingsItems に section: "trash" で入れる欄を order の順に並べる
// （ゴミ箱のプロジェクト = projects・アーカイブ済みのチャットの整理と使っていない会話記録 = chat・プロジェクトのないもの = trash）
import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { settingsItemsOf } from "@/features/settings/ui";
import { useUnassignedTrash } from "@/features/trash/ui/stores/trash";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { EmptyTrashButton, TrashRow } from "./TrashRow";

/** 節の id（欄を入れる持ち主が section に書く） */
export const TRASH_SETTINGS_SECTION = "trash";

export function TrashSettings() {
  return (
    <>
      {settingsItemsOf(TRASH_SETTINGS_SECTION).map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </>
  );
}

/** どのプロジェクトにも出ないゴミ箱のもの（プロジェクトの外の会話記録など。あるときだけ出す） */
export function UnassignedTrash() {
  const { data } = useUnassignedTrash();
  useTicker(60_000);
  if (!data?.length) return null;
  return (
    <section className="section">
      <h2>ゴミ箱（プロジェクトのないもの）</h2>
      <p className="muted small">{`どのプロジェクトのフォルダにも入らない場所のものです。${TRASH_KEEP_DAYS} 日たつと本当に消えます（待たずに完全に消すこともできます）。`}</p>
      <EmptyTrashButton items={data} label="すべて完全に消す" title={`プロジェクトのないゴミ箱のもの ${data.length} 件を完全に消しますか？`} />
      <ul className="trash-list">
        {data.map((item) => (
          <TrashRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
