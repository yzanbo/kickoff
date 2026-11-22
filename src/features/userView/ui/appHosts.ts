// userView がアプリの根に置く物: 利用者が見ているもの（メインはペインごとの前のタブ・選んでいる範囲など、別ウィンドウはその中身。AI の get_user_view が読む）を知らせる
import { useState } from "react";
import type { AppHost } from "@/foundation/ui/shell/points";
import { parsePopout } from "@/foundation/ui/navigation/popout";
import { useRoute } from "@/foundation/ui/navigation/router";
import { chatIdsOf, collectPopoutView, collectUserView, popoutChatIds } from "./userViewCollect";
import { useUserViewReport } from "./userViewReport";

function useMainUserViewReport() {
  const route = useRoute();
  useUserViewReport(() => collectUserView(route), (view) => chatIdsOf(view, route), [route]);
}

/** 別ウィンドウの行き先は開いたときから変わらない（中の画面の移動はメインのウィンドウで開く） */
function usePopoutUserViewReport() {
  const [route] = useState(() => parsePopout(location.hash)!);
  useUserViewReport(() => collectPopoutView(route), (view) => popoutChatIds(view, route), [route]);
}

export const userViewHosts: AppHost[] = [
  { id: "userViewReport", windows: "main", useEffect: useMainUserViewReport },
  { id: "userViewPopoutReport", windows: "popout", useEffect: usePopoutUserViewReport },
];
