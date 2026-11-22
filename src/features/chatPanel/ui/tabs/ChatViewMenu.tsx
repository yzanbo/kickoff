import { Check } from "lucide-react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { PANEL_VIEW_BUTTON_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import type { PanelController } from "@/features/panel/ui";
import { TabDisplayItems } from "./TabDisplayItems";
import { usePanelViewReset } from "./usePanelViewReset";

const separator = <div className="menu-separator" role="separator" />;

/**
 * チャットのパネル・チャットの別ウィンドウの「表示」のメニューの中身（欄の ViewMenu）: タブの表示（まとめ方・並び順・タブに出す項目・出すグループ・アーカイブ済み。
 * TabDisplayItems）｜「表示」ボタンを出す ｜ 既定に戻す。タブの右クリックの「タブの表示 ›」（tabMenu）はタブの表示の項目だけ。
 * チャットの画面の表示（タブの列・見出し・指示の帯など）は、チャットの見出しと会話の何もないところの右クリック・設定の「表示」で選ぶ
 */
export function ChatViewMenu({ panel, tabMenu = false }: { panel: PanelController; tabMenu?: boolean }) {
  // いちばん下の「既定に戻す」（メニューに出ている選び方を初めの値に戻す。初めのままなら押せない）
  const defaults = usePanelViewReset(panel.surface);
  // タブの列の「表示」ボタンを出すか（すべてのパネルで共通。隠しても、タブの列の何もないところの右クリックでこのメニューを開ける）
  const [buttonHidden, setButtonHidden] = useSetting(PANEL_VIEW_BUTTON_HIDDEN);
  if (tabMenu) return <TabDisplayItems panel={panel} />;
  return (
    <>
      <TabDisplayItems panel={panel} />
      {separator}
      <MenuItem
        role="menuitemcheckbox"
        checked={!buttonHidden}
        title={
          buttonHidden
            ? "タブの列の左に「表示」ボタンを出します"
            : "タブの列の左の「表示」ボタンを隠します（このメニューは、タブの列の何もないところの右クリックでも開けます）"
        }
        onSelect={() => setButtonHidden(!buttonHidden)}
      >
        <span className="project-switch-item">「表示」ボタンを出す</span>
        {!buttonHidden && <Check size={14} aria-hidden />}
      </MenuItem>
      {separator}
      <MenuItem
        disabled={!defaults.changed}
        title={defaults.changed ? "このメニューの選び方を初めの値に戻します" : "初めの選び方のままです"}
        keepOpen
        onSelect={defaults.reset}
      >
        <span className="project-switch-item">既定に戻す</span>
      </MenuItem>
    </>
  );
}
