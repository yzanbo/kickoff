// 入力欄が設定の「表示」に出す欄
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";
import { storage } from "@/features/composer/ui/storage";

/** チャット欄の大きさ（標準 / コンパクト） */
export function ComposerCompactField() {
  const [compactComposer, setCompactComposer] = useSetting(storage.settings.compact);
  return (
    <ChoiceField<"normal" | "compact">
      label="チャット欄"
      groupLabel="チャット欄の大きさ"
      help="コンパクトにすると、チャット欄の文字・余白・下のボタンを小さくして、縦の幅を抑えます。"
      value={compactComposer ? "compact" : "normal"}
      onChange={(v) => setCompactComposer(v === "compact")}
      options={[
        { value: "normal", label: "標準" },
        { value: "compact", label: "コンパクト" },
      ]}
    />
  );
}
