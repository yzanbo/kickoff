import { popoutPath, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { SideScope } from "@/features/conversation/ui";
import { SideNote } from "./SideNote";

/** 別ウィンドウのノート（右の欄と同じく、開いたチャットを「メインのチャット」にする） */
export function NotePopoutPage({ route }: { route: Extract<PopoutRoute, { kind: "note" }> }) {
  return (
    <SideScope mainChatId={route.chatId ?? null}>
      <div className="popout-body">
        <SideNote
          projectId={route.projectId}
          path={route.path}
          chatId={route.chatId ?? null}
          // 名前を変えたら、ウィンドウの URL も新しい名前に（読み込み直しても同じノートを開く）
          onRenamed={(to) => history.replaceState(null, "", `#${popoutPath({ ...route, path: to })}`)}
        />
      </div>
    </SideScope>
  );
}
