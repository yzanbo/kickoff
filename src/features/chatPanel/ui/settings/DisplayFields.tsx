// チャットのパネルが設定の「表示」に出す欄: タブの列・タブの列の「表示」ボタン
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { Field } from "@/foundation/ui/kit/Field";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { panelSettings } from "@/features/panel/ui";

/** チャットのタブの列を出すか */
export function ChatTabRowField() {
  const [tabRowHidden, setTabRowHidden] = useSetting(panelSettings.chatTabRowHidden);
  return (
    <Field as="div"
      label="チャットのタブの列"
      help="チャットのパネルの上の、開いているチャットのタブと、表示・新しいタブ・分けるボタンが並ぶ行です。隠すと、その分チャットの縦の幅が広がります（チャットは左のサイドバー・ボードから切り替えます）。会話の何もないところ・チャットの見出しの右クリックでも切り替えられます。"
    >
      <Segmented<"show" | "hide">
        label="チャットのタブの列"
        value={tabRowHidden ? "hide" : "show"}
        onChange={(v) => setTabRowHidden(v === "hide")}
        options={[
          { value: "show", label: "表示する" },
          { value: "hide", label: "隠す" },
        ]}
      />
    </Field>
  );
}

/** タブの列の「表示」ボタンを出すか */
export function PanelViewButtonField() {
  const [viewButtonHidden, setViewButtonHidden] = useSetting(panelSettings.viewButtonHidden);
  return (
    <Field as="div"
      label="タブの列の「表示」ボタン"
      help="タブの列の左の、チャットのまとめ方・並び順・タブに出す項目などを選ぶボタン（調整のアイコン）です。すべてのパネル（チャット・下のパネル・右サイドバーなど）で共通です。隠しても、タブの列の何もないところの右クリックで同じメニューを開けます。そのメニューの「「表示」ボタンを出す」でも切り替えられます。"
    >
      <Segmented<"show" | "hide">
        label="タブの列の「表示」ボタン"
        value={viewButtonHidden ? "hide" : "show"}
        onChange={(v) => setViewButtonHidden(v === "hide")}
        options={[
          { value: "show", label: "表示する" },
          { value: "hide", label: "隠す" },
        ]}
      />
    </Field>
  );
}
