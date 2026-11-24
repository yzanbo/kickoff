import "./OpenPlaceControls.css";
import { AppWindow, type LucideIcon, MessageSquare, PanelRight } from "lucide-react";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { canPopout } from "@/foundation/ui/navigation/popout";
import { useOptionalSubagentNav } from "@/features/chat/ui/screen/ports";

/** 開く場所（会話内 = メインの流れの中 / 右 = チャットの画面の右の欄 / 新規ウィンドウ） */
export type OpenPlace = "inline" | "side" | "window";

/** 開く場所の名前とアイコン（入力欄の上の一覧の行のボタン・「押したとき」の切り替えで共通） */
const OPEN_PLACES: Record<OpenPlace, { label: string; short: string; icon: LucideIcon }> = {
  inline: { label: "会話内で開く", short: "会話内", icon: MessageSquare },
  side: { label: "右で開く", short: "右", icon: PanelRight },
  window: { label: "新規ウィンドウで開く", short: "新規ウィンドウ", icon: AppWindow },
};

/** 置ける場所（右の欄はパネルの中のチャットの画面だけ、別ウィンドウは Mac のアプリだけ） */
export interface PlaceCaps {
  canSide: boolean;
  canWindow: boolean;
}

/** いまの画面で置ける場所（右の欄はサブエージェントの口が右の欄を持つときだけ） */
export function usePlaceCaps(): PlaceCaps {
  return { canSide: useOptionalSubagentNav()?.canOpenSide ?? false, canWindow: canPopout() };
}

/** 開く場所のボタンの並び（流れの中 → 右 → 新規ウィンドウ。置けない場所は出さない） */
export function placesOf(caps: PlaceCaps, { inline }: { inline: boolean }): OpenPlace[] {
  return [...(inline ? (["inline"] as const) : []), ...(caps.canSide ? (["side"] as const) : []), ...(caps.canWindow ? (["window"] as const) : [])];
}

/**
 * 一覧の行の右に並べる、開く場所のボタン（行を押すと既定の場所、ボタンでその場所に開く）。
 * 押しても行の押したことにはしない（stopPropagation）
 */
export function OpenPlaceButtons<T extends OpenPlace>({ places, onOpen }: { places: readonly T[]; onOpen: (place: T) => void }) {
  return (
    <span className="open-place-buttons">
      {places.map((place) => (
        <IconButton
          key={place}
          type="button"
          icon={OPEN_PLACES[place].icon}
          iconSize={13}
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

/** 一覧の上の「行を押したとき」の既定の開き方（設定の「表示」と同じ設定を変える）。inline: ほかの物と 1 行に並べる（余白と線は行が持つ） */
export function DefaultOpenPlace<T extends OpenPlace>({ places, value, onChange, inline = false }: { places: readonly T[]; value: T; onChange: (place: T) => void; inline?: boolean }) {
  return (
    <div className="open-place-default" data-variant={inline ? "inline" : undefined}>
      <span className="open-place-default-label">行を押したとき</span>
      <Segmented<T>
        size="sm"
        className="open-place-switch"
        label="行を押したときの開き方"
        value={value}
        onChange={onChange}
        options={places.map((p) => ({ value: p, label: OPEN_PLACES[p].short, icon: OPEN_PLACES[p].icon, tip: `${OPEN_PLACES[p].label}（設定の「表示」と同じ）` }))}
      />
    </div>
  );
}
