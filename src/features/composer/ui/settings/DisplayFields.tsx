// 入力欄が設定の「表示」に出す欄
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { storage } from "@/features/composer/ui/storage";

/** チャット欄の大きさ（標準 / コンパクト） */
export function ComposerCompactField() {
  const [compactComposer, setCompactComposer] = useSetting(storage.settings.compact);
  return (
    <Field as="div" label="チャット欄" help="コンパクトにすると、チャット欄の文字・余白・下のボタンを小さくして、縦の幅を抑えます。">
      <Segmented<"normal" | "compact">
        label="チャット欄の大きさ"
        value={compactComposer ? "compact" : "normal"}
        onChange={(v) => setCompactComposer(v === "compact")}
        options={[
          { value: "normal", label: "標準" },
          { value: "compact", label: "コンパクト" },
        ]}
      />
    </Field>
  );
}
