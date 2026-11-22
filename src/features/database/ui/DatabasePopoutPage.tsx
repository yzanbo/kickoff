import type { PopoutRoute } from "@/foundation/ui/navigation/popout";
import { SideScope } from "@/features/conversation/ui";
import { LazyDatabaseClient } from "./LazyDatabaseClient";

/** 別ウィンドウの DB クライアント（右の欄と同じく、開いたチャットを「メインのチャット」にする） */
export function DatabasePopoutPage({ route }: { route: Extract<PopoutRoute, { kind: "database" }> }) {
  return (
    <SideScope mainChatId={route.chatId}>
      <div className="popout-body">
        <LazyDatabaseClient projectId={route.projectId} place={`chat-${route.chatId}`} worktree={route.worktree ?? null} />
      </div>
    </SideScope>
  );
}
