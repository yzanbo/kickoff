// チャットのパネルが設定の「表示」に出す欄: タブの列・タブの列の「表示」ボタン
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { SwitchField } from "@/foundation/ui/kit/ChoiceField";
import { panelSettings } from "@/features/panel/ui";

/** チャットのタブの列を出すか */
export function ChatTabRowField() {
  const [tabRowHidden, setTabRowHidden] = useSetting(panelSettings.chatTabRowHidden);
  return (
    <SwitchField
      label="チャットのタブの列"
      help="チャットのパネルの上の、開いているチャットのタブと、表示・新しいタブ・分けるボタンが並ぶ行です。隠すと、その分チャットの縦の幅が広がります（チャットは左のサイドバー・ボードから切り替えます）。会話の何もないところ・チャットの見出しの右クリックでも切り替えられます。"
      checked={!tabRowHidden}
      onChange={(on) => setTabRowHidden(!on)}
      onLabel="表示する"
      offLabel="隠す"
    />
  );
}

/** タブの列の「表示」ボタンを出すか */
export function PanelViewButtonField() {
  const [viewButtonHidden, setViewButtonHidden] = useSetting(panelSettings.viewButtonHidden);
  return (
    <SwitchField
      label="タブの列の「表示」ボタン"
      help="タブの列の左の、チャットのまとめ方・並び順・タブに出す項目などを選ぶボタン（調整のアイコン）です。すべてのパネル（チャット・下のパネル・右サイドバーなど）で共通です。隠しても、タブの列の何もないところの右クリックで同じメニューを開けます。そのメニューの「「表示」ボタンを出す」でも切り替えられます。"
      checked={!viewButtonHidden}
      onChange={(on) => setViewButtonHidden(!on)}
      onLabel="表示する"
      offLabel="隠す"
    />
  );
}
