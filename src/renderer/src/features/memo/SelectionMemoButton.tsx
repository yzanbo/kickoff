import { Check, ChevronDown } from "lucide-react";
import { useEffect } from "react";
import { useSetting } from "@/hooks/useSetting";
import { MEMO_ADD_DEFAULT } from "@/lib/storageKeys";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { addToMemo, MEMO_ADD_MODE_LABELS, MEMO_ADD_MODES, needsTargetMemo, type MemoAddMode } from "./addToMemo";
import { MEMO_ADD_MODE_ICONS, MemoModeItems, PICK_MEMO_LABELS, RecentMemoItems } from "./MemoMenuItems";

/** ボタンから開くメニュー（modes = ▾ の入れ方と既定 / pick = 既定が既存のメモに足す入れ方のときの、メモを選ぶ一覧） */
type OpenKind = "modes" | "pick";

/** ▾ を押したときに、外側のクリックとして閉じないためのセレクタ（押すたびに開閉する） */
const MORE_SELECTOR = ".selection-memo-more";
const MAIN_SELECTOR = ".selection-memo-main";

/**
 * 文を選んだときの上のボタンの「メモ ▾」（「チャットに追加」の横）。text は選んだ部分（返答は Markdown に戻したもの）。
 * - 「メモ」: 既定の入れ方（MEMO_ADD_DEFAULT。初めは新しいメモを作成）ですぐメモにする。既定が既存のメモに追記・AI で組み込む なら、足すメモを選ぶ一覧を出す
 * - ▾: ほかの入れ方（発言の右クリックと同じ 4 項目 MemoModeItems）と、その下に「メモ」で行う入れ方（既定）の選択
 * メニューを開いている間は onHold(true)（選んだ範囲の上のボタンを、外側のクリック・選び直しで消さない）。メモにしたら onDone
 */
export function SelectionMemoButton({
  projectId,
  chatId,
  text,
  onHold,
  onDone,
}: {
  projectId: number;
  chatId: number;
  text: string;
  onHold: (hold: boolean) => void;
  onDone: () => void;
}) {
  const [defaultMode, setDefaultMode] = useSetting(MEMO_ADD_DEFAULT);
  const menu = useContextMenu<OpenKind>({ gap: 6 });
  const open = menu.menu;
  useEffect(() => onHold(menu.isOpen), [menu.isOpen, onHold]);

  const add = (mode: MemoAddMode, target: string | null) => {
    void addToMemo({ projectId, chatId, text, mode, target });
    onDone();
  };
  const Icon = MEMO_ADD_MODE_ICONS[defaultMode];
  const pickMode = needsTargetMemo(defaultMode) ? (defaultMode as "append" | "merge") : null;

  return (
    <span className="selection-memo">
      <button
        type="button"
        className="btn selection-attach-button selection-memo-main"
        title={`${MEMO_ADD_MODE_LABELS[defaultMode]}（▾ でほかの追加のしかた・「メモ」で行う追加の変更）`}
        aria-haspopup={pickMode ? "menu" : undefined}
        aria-expanded={pickMode ? open?.value === "pick" : undefined}
        // 押してもピントが移って選択が消えないように
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => (pickMode ? menu.toggle(e, "pick") : add(defaultMode, null))}
      >
        <Icon size={13} aria-hidden />
        メモ
      </button>
      <button
        type="button"
        className="btn selection-attach-button selection-memo-more"
        aria-label="メモへの追加のしかたを選ぶ"
        title="メモへの追加のしかたを選ぶ（「メモ」で行う追加も変えられます）"
        aria-haspopup="menu"
        aria-expanded={open?.value === "modes"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => menu.toggle(e, "modes")}
      >
        <ChevronDown size={13} aria-hidden />
      </button>
      {open?.value === "modes" && (
        <PopupMenu at={open.at} label="メモへの追加" ignore={MORE_SELECTOR} onClose={menu.close}>
          <MemoModeItems projectId={projectId} onAdd={add} />
          <div className="menu-separator" role="separator" />
          <div className="menu-label">「メモ」を押したときの追加</div>
          {MEMO_ADD_MODES.map((mode) => {
            const ModeIcon = MEMO_ADD_MODE_ICONS[mode];
            // 選んだものに ✓（ChoiceMenu と同じ形）
            return (
              <MenuItem key={mode} role="menuitemradio" checked={mode === defaultMode} keepOpen onSelect={() => setDefaultMode(mode)}>
                <ModeIcon size={14} aria-hidden />
                <span className="project-switch-item">{MEMO_ADD_MODE_LABELS[mode]}</span>
                {mode === defaultMode && <Check size={14} aria-hidden />}
              </MenuItem>
            );
          })}
        </PopupMenu>
      )}
      {open?.value === "pick" && pickMode && (
        <PopupMenu at={open.at} label={PICK_MEMO_LABELS[pickMode]} ignore={MAIN_SELECTOR} onClose={menu.close}>
          <div className="menu-label">{PICK_MEMO_LABELS[pickMode]}</div>
          <RecentMemoItems projectId={projectId} onPick={(path) => add(pickMode, path)} />
        </PopupMenu>
      )}
    </span>
  );
}
