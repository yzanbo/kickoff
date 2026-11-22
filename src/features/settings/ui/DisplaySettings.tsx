// 設定の「表示」の節（中身は持ち主が settingsItems に section: "display" で入れる欄を order の順に並べる）と、テーマの欄・開く場所を選ぶ欄の形
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { useTheme, type Theme } from "@/foundation/ui/theme/theme";
import { settingsItemsOf } from "./points";

/** 表示の節 */
export function DisplaySettings() {
  return (
    <section className="section">
      <h2>表示</h2>
      <div className="form">
        {settingsItemsOf("display").map(({ id, Component }) => (
          <Component key={id} />
        ))}
      </div>
    </section>
  );
}

/** テーマ */
export function ThemeField() {
  const [theme, setTheme] = useTheme();
  return (
    <Field label="テーマ">
      <Segmented<Theme>
        label="テーマ"
        value={theme}
        onChange={setTheme}
        options={[
          { value: "dark", label: "ダーク" },
          { value: "light", label: "ライト" },
          { value: "system", label: "システムに合わせる" },
        ]}
      />
    </Field>
  );
}

/** 右の欄か別ウィンドウかを選ぶ欄（子チャット・ノートを開く場所） */
export function OpenPlaceField({ label, help, value, onChange }: { label: string; help: string; value: "side" | "window"; onChange: (v: "side" | "window") => void }) {
  return (
    <Field label={label} help={help}>
      <Segmented<"side" | "window">
        label={label}
        value={value}
        onChange={onChange}
        options={[
          { value: "side", label: "右の欄" },
          { value: "window", label: "別ウィンドウ" },
        ]}
      />
    </Field>
  );
}
