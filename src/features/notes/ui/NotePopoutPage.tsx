import { useEffect, useState } from "react";
import { isUnder, remapPrefix } from "@shared/foundation/path";
import { popoutPath, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { SideScope } from "@/features/conversation/ui";
import { SideNote } from "./SideNote";

type NoteRoute = Extract<PopoutRoute, { kind: "note" }>;

/** 別ウィンドウのノート（右の欄と同じく、開いたチャットを「メインのチャット」にする） */
export function NotePopoutPage({ route: opened }: { route: NoteRoute }) {
  // round: ほかのウィンドウで動かされて開き直した回数（SideNote は開いたパスを中で持つので、作り直して新しい場所を開く。自分で名前を変えたときは作り直さない）
  const [{ route, round }, setShown] = useState({ route: opened, round: 0 });
  // 名前を変えた・動かした（欄の間も）ら、ウィンドウの URL も新しい場所に（読み込み直しても同じノートを開く）
  const writeUrl = (next: NoteRoute) => history.replaceState(null, "", `#${popoutPath(next)}`);
  useEffect(
    () =>
      onWindowMessage("noteMoved", (m) =>
        setShown((now) => {
          if (now.route.projectId !== m.projectId || !isUnder(now.route.path, m.from)) return now;
          const next = { ...now.route, projectId: m.toProjectId, path: remapPrefix(now.route.path, m.from, m.to) };
          writeUrl(next);
          return { route: next, round: now.round + 1 };
        }),
      ),
    [],
  );
  return (
    <SideScope mainChatId={route.chatId ?? null}>
      <div className="popout-body">
        <SideNote
          key={round}
          projectId={route.projectId}
          path={route.path}
          chatId={route.chatId ?? null}
          onRenamed={(to) => {
            const next = { ...route, path: to };
            writeUrl(next);
            setShown((now) => ({ ...now, route: next }));
          }}
        />
      </div>
    </SideScope>
  );
}
