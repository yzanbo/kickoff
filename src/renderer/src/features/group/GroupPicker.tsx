import { Folder } from "lucide-react";
import type { ChatGroup } from "@shared/types";
import { ChipPicker } from "@/ui/ChipPicker";
import { NO_GROUP_LABEL } from "@/features/chat/chatTitle";

/** グループなしの値（選択肢の値は文字列なので、グループの ID を文字にして持つ） */
const NONE = "";

/**
 * 新しいチャットの作成先のグループを選ぶ札。見た目はチャットの見出しのグループの札（GroupChip）と同じ（グループの色・フォルダの印・名前）に ▾ を付けたもの。
 * グループなしは色を付けずに「No Group」
 */
export function GroupPicker({ groups, value, onChange }: { groups: ChatGroup[]; value: number | undefined; onChange: (group: number | undefined) => void }) {
  const current = groups.find((g) => g.id === value);
  const values = [NONE, ...groups.map((g) => String(g.id))];
  const labels: Record<string, string> = { [NONE]: NO_GROUP_LABEL, ...Object.fromEntries(groups.map((g) => [String(g.id), g.name])) };
  return (
    <ChipPicker
      className="chat-group-chip"
      hue={current?.hue}
      empty={!current}
      icon={Folder}
      name={current?.name ?? NO_GROUP_LABEL}
      tip={current ? `作成先のグループ「${current.name}」（押すと選び直す）` : "作成先のグループ（押すと選ぶ）"}
      menuTitle="作成先のグループ"
      values={values}
      labels={labels}
      value={current ? String(current.id) : NONE}
      onPick={(next) => onChange(next === NONE ? undefined : Number(next))}
    />
  );
}
