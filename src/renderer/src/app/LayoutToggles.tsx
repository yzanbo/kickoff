import { PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { cx } from "@/lib/cx";
import type { ProjectHeaderMode } from "@/features/project/page/headerMode";

interface Toggle {
  open: boolean;
  onToggle: () => void;
}

/**
 * 画面の右上の、レイアウトの開閉（VS Code の右上と同じ）: 左のサイドバー（⌘B）・下のパネル（ターミナル。⌃` / ⌘J）・
 * 右のチャット欄（⌥⌘B。全プロジェクトの画面では、サイドバーで選んでいるプロジェクトのもの。プロジェクトが 1 つもなければ出さない）。出せないものは渡さない。
 * アイコンは、サイドバー・フッター・右の欄の閉じる / 開くボタンと同じ向きのもの（開いていれば閉じる向き、閉じていれば開く向き）。
 * プロジェクトの画面では、見出しの行の出し方（reveal）に合わせる: 寄せたときだけ表示なら見出しと一緒に出し入れし（.layout-toggles.auto-hide）、
 * 非表示なら出さない（利用者の依頼。ショートカットはそのまま効く）
 */
export function LayoutToggles({ sidebar, bottom, chat, reveal = "show" }: { sidebar: Toggle; bottom?: Toggle; chat?: Toggle; reveal?: ProjectHeaderMode }) {
  if (reveal === "hide") return null;
  return (
    <div className={cx("layout-toggles", reveal === "hover" && "auto-hide")} role="group" aria-label="レイアウト">
      <IconButton
        icon={sidebar.open ? PanelLeftClose : PanelLeftOpen}
        size={15}
        label={sidebar.open ? "サイドバーを閉じる" : "サイドバーを開く"}
        title={`${sidebar.open ? "サイドバーを閉じる" : "サイドバーを開く"}（⌘B）`}
        aria-pressed={sidebar.open}
        className={sidebar.open ? "active" : undefined}
        onClick={sidebar.onToggle}
      />
      {bottom && (
        <IconButton
          icon={bottom.open ? PanelBottomClose : PanelBottomOpen}
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
          icon={chat.open ? PanelRightClose : PanelRightOpen}
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
