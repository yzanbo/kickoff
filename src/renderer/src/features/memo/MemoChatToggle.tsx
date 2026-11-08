import { Check, ChevronDown, MessageSquare, MessageSquareOff } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { cx } from "@/lib/cx";

/** メモのチャットの見え方: 欄を開く / チャット表示のみ（閉じて下の入力欄だけ出す）/ 非表示（入力欄も出さない） */
type MemoChatShow = "open" | "quick" | "hidden";

const SHOW_ITEMS: { value: MemoChatShow; label: string; title: string }[] = [
  { value: "open", label: "会話を開く", title: "本文の横（か下）にメモのチャットの欄を開き、これまでのやり取りを見ながら話す" },
  { value: "quick", label: "チャット表示のみ", title: "欄は閉じ、メモの下に AI に直してもらうチャットの入力欄だけを出す" },
  { value: "hidden", label: "非表示", title: "欄もメモの下の入力欄も出さず、メモだけを広く見る（吹き出しのボタンでいつでも開ける）" },
];

/** 吹き出しを押したときの次の見え方（非表示 → チャット表示のみ → 会話を開く → 非表示 … と回る。利用者の依頼） */
const NEXT_SHOW: Record<MemoChatShow, MemoChatShow> = { hidden: "quick", quick: "open", open: "hidden" };

const labelOf = (value: MemoChatShow) => SHOW_ITEMS.find((item) => item.value === value)?.label ?? "";

/**
 * メモの見出しの、メモのチャットの切り替え（吹き出しと ▾ を 1 つのボタンに見せる .panel-split-button）。
 * 吹き出しは押すたびに 3 つの見え方を 非表示 → チャット表示のみ → 会話を開く の順に回し（アイコンでいまの見え方を出す: 会話を開く = アクセントの色の吹き出し /
 * チャット表示のみ = 吹き出し / 非表示 = 斜線の吹き出し）、▾ は 3 つから直に選ぶメニュー
 */
export function MemoChatToggle({
  open,
  quickHidden,
  onOpenChange,
  onQuickHiddenChange,
}: {
  open: boolean;
  /** 閉じている間、メモの下の入力欄も隠すか */
  quickHidden: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickHiddenChange: (hidden: boolean) => void;
}) {
  const menu = useContextMenu({ align: "end" });
  const current: MemoChatShow = open ? "open" : quickHidden ? "hidden" : "quick";
  const choose = (value: MemoChatShow) => {
    onOpenChange(value === "open");
    // 開くときは閉じ方の選択を変えない（閉じたら、前と同じ閉じ方に戻す）
    if (value !== "open") onQuickHiddenChange(value === "hidden");
  };
  const next = NEXT_SHOW[current];
  return (
    <span className="panel-split-button memo-chat-split">
      <IconButton
        icon={current === "hidden" ? MessageSquareOff : MessageSquare}
        label={`メモのチャット: ${labelOf(current)}（押すと「${labelOf(next)}」）`}
        aria-pressed={open}
        className={cx("memo-chat-toggle", open && "on")}
        onClick={() => choose(next)}
      />
      <IconButton
        icon={ChevronDown}
        label="メモのチャットの見え方"
        title="会話を開く・チャット表示のみ・非表示から選ぶ"
        size={12}
        className="panel-open-with memo-chat-show"
        aria-haspopup="menu"
        aria-expanded={Boolean(menu.menu)}
        onClick={(e) => menu.toggle(e)}
      />
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="メモのチャットの見え方" ignore=".memo-chat-show" onClose={menu.close}>
          {SHOW_ITEMS.map((item) => (
            <MenuItem key={item.value} role="menuitemradio" checked={current === item.value} title={item.title} onSelect={() => choose(item.value)}>
              <span className="project-switch-item">{item.label}</span>
              {current === item.value && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </span>
  );
}
