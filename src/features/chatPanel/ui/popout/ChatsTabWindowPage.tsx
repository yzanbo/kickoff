import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { PopoutTabWindow, type PanelTab } from "@/features/panel/ui";

type ChatsRoute = Extract<PopoutRoute, { kind: "chats" }>;

/** 移したチャットのタブ（送る前の新しいチャットはキーが下書きのキー。中身は composer の下書きの店） */
const firstTab = (route: ChatsRoute): PanelTab => (route.chatId !== undefined ? { kind: "chat", key: route.key, id: route.chatId, projectId: route.projectId } : { kind: "new", key: route.key });

/** チャットの別ウィンドウ（タブの列を持ち、ほかのチャットのタブもドラッグで足せる。欄 cwin） */
export function ChatsTabWindowPage({ route }: { route: ChatsRoute }) {
  return <PopoutTabWindow route={route} surface="cwin" first={firstTab as (route: PopoutRoute) => PanelTab} />;
}
