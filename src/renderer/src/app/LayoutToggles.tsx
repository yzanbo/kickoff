import { PanelBottom, PanelLeft, PanelRight } from "lucide-react";
import { IconButton } from "@/ui/IconButton";

interface Toggle {
  open: boolean;
  onToggle: () => void;
}

/**
 * 画面の右上の、レイアウトの開閉（VS Code の右上と同じ）: 左のサイドバー（⌘B）・下のパネル（ターミナル。⌃` / ⌘J）・
 * 右のチャット欄（⌥⌘B。全プロジェクトの画面では、サイドバーで選んでいるプロジェクトのもの。プロジェクトが 1 つもなければ出さない）。出せないものは渡さない
 */
export function LayoutToggles({ sidebar, bottom, chat }: { sidebar: Toggle; bottom?: Toggle; chat?: Toggle }) {
  return (
    <div className="layout-toggles" role="group" aria-label="レイアウト">
      <IconButton
        icon={PanelLeft}
        size={15}
        label={sidebar.open ? "サイドバーを閉じる" : "サイドバーを開く"}
        title={`${sidebar.open ? "サイドバーを閉じる" : "サイドバーを開く"}（⌘B）`}
        aria-pressed={sidebar.open}
        className={sidebar.open ? "active" : undefined}
        onClick={sidebar.onToggle}
      />
      {bottom && (
        <IconButton
          icon={PanelBottom}
          size={15}
          label={bottom.open ? "ターミナルを閉じる" : "ターミナルを開く"}
          title={`${bottom.open ? "ターミナルを閉じる" : "ターミナルを開く"}（⌃\` / ⌘J）`}
          aria-pressed={bottom.open}
          className={bottom.open ? "active" : undefined}
          onClick={bottom.onToggle}
        />
      )}
      {chat && (
        <IconButton
          icon={PanelRight}
          size={15}
          label={chat.open ? "チャット欄を閉じる" : "チャット欄を開く"}
          title={`${chat.open ? "チャット欄を閉じる" : "チャット欄を開く"}（⌥⌘B）`}
          aria-pressed={chat.open}
          className={chat.open ? "active" : undefined}
          onClick={chat.onToggle}
        />
      )}
    </div>
  );
}
