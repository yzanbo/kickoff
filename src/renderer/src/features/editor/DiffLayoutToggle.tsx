import { useSetting } from "@/hooks/useSetting";
import { DIFF_LAYOUT } from "@/lib/storageKeys";
import { Segmented } from "@/ui/Segmented";

/** 差分の表示のしかた（並べて表示 / まとめて表示。DIFF_LAYOUT。ファイルタブの差分・右の欄の「変更」・差分から編集しているときで共通） */
export function DiffLayoutToggle() {
  const [layout, setLayout] = useSetting(DIFF_LAYOUT);
  return (
    <Segmented
      className="view-toggle"
      label="差分の表示のしかた"
      value={layout}
      onChange={setLayout}
      options={[
        { value: "split", label: "並べて表示" },
        { value: "unified", label: "まとめて表示" },
      ]}
    />
  );
}
