import { AppWindow, type LucideIcon, MessageSquare, PanelRight } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { Segmented } from "@/ui/Segmented";

/** 開く場所（会話内 = メインの流れの中 / 右 = チャットの画面の右の欄 / 新規ウィンドウ） */
export type OpenPlace = "inline" | "side" | "window";

/** 開く場所の名前とアイコン（入力欄の上の一覧の行のボタン・「押したとき」の切り替えで共通） */
const OPEN_PLACES: Record<OpenPlace, { label: string; short: string; icon: LucideIcon }> = {
  inline: { label: "会話内で開く", short: "会話内", icon: MessageSquare },
  side: { label: "右で開く", short: "右", icon: PanelRight },
  window: { label: "新規ウィンドウで開く", short: "新規ウィンドウ", icon: AppWindow },
};

/**
 * 一覧の行の右に並べる、開く場所のボタン（行を押すと既定の場所、ボタンでその場所に開く）。
 * 押しても行の押したことにはしない（stopPropagation）
 */
export function OpenPlaceButtons({ places, onOpen }: { places: readonly OpenPlace[]; onOpen: (place: OpenPlace) => void }) {
  return (
    <span className="open-place-buttons">
      {places.map((place) => (
        <IconButton
          key={place}
          type="button"
          icon={OPEN_PLACES[place].icon}
          size={13}
          label={OPEN_PLACES[place].label}
          className="open-place-button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(place);
          }}
        />
      ))}
    </span>
  );
}

/** 一覧の上の「行を押したとき」の既定の開き方（設定の「表示」と同じ設定を変える） */
export function DefaultOpenPlace<T extends OpenPlace>({ places, value, onChange }: { places: readonly T[]; value: T; onChange: (place: T) => void }) {
  return (
    <div className="open-place-default">
      <span className="open-place-default-label">行を押したとき</span>
      <Segmented<T>
        className="segmented open-place-switch"
        label="行を押したときの開き方"
        value={value}
        onChange={onChange}
        options={places.map((p) => ({ value: p, label: OPEN_PLACES[p].short, icon: OPEN_PLACES[p].icon, tip: `${OPEN_PLACES[p].label}（設定の「表示」と同じ）` }))}
      />
    </div>
  );
}
