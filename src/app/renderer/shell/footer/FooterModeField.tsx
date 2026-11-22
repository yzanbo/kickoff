// 下の帯の出し方の欄（設定の「表示」。殻の欄なので registry が直に足す）
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { FOOTER_MODE_LABELS, FOOTER_MODES, useFooterMode, type FooterMode } from "@/foundation/ui/shell/footerMode";

/** 下の帯の出し方 */
export function FooterModeField() {
  const [footerMode, setFooterMode] = useFooterMode();
  return (
    <Field
      label="下の帯"
      help="画面のいちばん下の、設定・接続・ブランチ・使用状況が並ぶ帯です。「寄せたときだけ表示」は、マウスを画面の下端に寄せると画面の上に重ねて出し、ふだんは縦の幅を取りません。非表示にしても、設定は ⌘, で開けます。帯の右クリックでも切り替えられます。"
    >
      <Segmented<FooterMode>
        label="下の帯の出し方"
        value={footerMode}
        onChange={setFooterMode}
        options={FOOTER_MODES.map((m) => ({ value: m, label: FOOTER_MODE_LABELS[m] }))}
      />
    </Field>
  );
}
