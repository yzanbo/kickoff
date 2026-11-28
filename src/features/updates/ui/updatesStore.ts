// 更新の様子（メインから届いたもの。Mac のアプリの外・届く前は null）と、メインの知らせを受ける殻の hook
import { useEffect } from "react";
import type { UpdatesSnapshot } from "@shared/updates/types";
import { createCell } from "@/foundation/ui/store/cell";
import { openSettings } from "@/features/settings/ui";
import { updatesNative } from "./native";
/** 設定の節「Kickoff について」の id（メニューの「アップデートを確認…」もこの節を開く） */
export const ABOUT_SECTION = "about";

export const updatesCell = createCell<UpdatesSnapshot | null>(null);

/** メインのウィンドウの殻で呼ぶ: いまの様子を読み、変わったら入れ替える。メニューの「アップデートを確認…」で設定の「Kickoff について」を開く */
export function useUpdatesBridge() {
  useEffect(() => {
    let alive = true;
    void updatesNative.snapshot().then((s) => alive && s && updatesCell.set(s));
    const offState = updatesNative.onState((s) => updatesCell.set(s));
    const offOpen = updatesNative.onOpenRequested(() => openSettings(ABOUT_SECTION));
    return () => {
      alive = false;
      offState?.();
      offOpen?.();
    };
  }, []);
}
