import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage as uiStorage } from "@/foundation/ui/hooks/storage";
import { Segmented } from "@/foundation/ui/kit/Segmented";

/** いまの差分の表示のしかた（ui:diff-layout。差分のどこでも同じ値） */
export function useDiffLayout() {
  return useSetting(uiStorage.settings.diffLayout)[0];
}

/** 差分の表示のしかた（並べて表示 / まとめて表示。ui:diff-layout。ファイルタブの差分・右の欄の「変更」・差分から編集しているときで共通） */
export function DiffLayoutToggle() {
  const [layout, setLayout] = useSetting(uiStorage.settings.diffLayout);
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
