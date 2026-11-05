import { PanelBottom, PanelLeft, PanelRight, PanelTop } from "lucide-react";
import { IconButton } from "@/ui/IconButton";

interface Toggle {
  open: boolean;
  onToggle: () => void;
}

/**
 * レイアウトの開閉（VS Code の右上と同じ並び）: 左のサイドバー（⌘B）・上の見出しの行（プロジェクト名・フォルダ・状態ごとの数。隠すとその分縦に広がる）・
 * 下のパネル（ターミナル。⌃` / ⌘J）・右のチャット欄（⌥⌘B。全プロジェクトの画面では、サイドバーで選んでいるプロジェクトのもの。プロジェクトが 1 つもなければ出さない）。
 * 出せないものは渡さない。置き場所は、サイドバーを開いているときはサイドバーのいちばん上の行の右端（Sidebar の toolbar）、閉じているときは画面の左上の
 * 信号機ボタンの右（floating）。右側の画面の上に浮かせないので、見出しの行を隠すとボード・チャットがそのまま画面のいちばん上まで詰まる
 */
export function LayoutToggles({ sidebar, title, bottom, chat, floating }: { sidebar: Toggle; title?: Toggle; bottom?: Toggle; chat?: Toggle; floating?: boolean }) {
  return (
    <div className={floating ? "layout-toggles floating" : "layout-toggles"} role="group" aria-label="レイアウト">
      <IconButton
        icon={PanelLeft}
        size={15}
        label={sidebar.open ? "サイドバーを閉じる" : "サイドバーを開く"}
        title={`${sidebar.open ? "サイドバーを閉じる" : "サイドバーを開く"}（⌘B）`}
        aria-pressed={sidebar.open}
        className={sidebar.open ? "active" : undefined}
        onClick={sidebar.onToggle}
      />
      {title && (
        <IconButton
          icon={PanelTop}
          size={15}
          label={title.open ? "見出しを隠す" : "見出しを表示"}
          title={title.open ? "見出しの行を隠す（プロジェクト名・フォルダ・状態ごとの数。隠すとその分縦に広がります）" : "見出しの行を表示"}
          aria-pressed={title.open}
          className={title.open ? "active" : undefined}
          onClick={title.onToggle}
        />
      )}
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
