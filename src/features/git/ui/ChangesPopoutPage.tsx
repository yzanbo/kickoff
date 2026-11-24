import { useEffect, useState } from "react";
import { popoutKey, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { PopoutFilesFrame } from "@/features/files/ui";
import { SideChanges } from "./SideChanges";

/**
 * 別ウィンドウの「変更」（チャットの画面の右の欄と同じ中身）。行の「チャットに追加」・右クリックの「メインのチャット」は、メインのウィンドウのそのチャットのチャット欄に足す。
 * もう開いているウィンドウへの「このファイルの位置へ」の知らせ（popoutFocus）でも移る
 */
export function ChangesPopoutPage({ route }: { route: Extract<PopoutRoute, { kind: "changes" }> }) {
  // 移るファイル（初めは URL のもの。開いているときに、ほかの所から同じウィンドウを開き直されたら知らせで受け取る）
  const [focus, setFocus] = useState({ path: route.focus, at: Date.now() });
  useEffect(
    () =>
      onWindowMessage("popoutFocus", (m) => {
        if (m.key === popoutKey(route)) setFocus({ path: m.focus, at: Date.now() });
      }),
    [route],
  );
  return (
    <PopoutFilesFrame chatId={route.chatId} projectId={route.projectId} worktree={route.worktree}>
      <SideChanges projectId={route.projectId} worktree={route.worktree} focus={focus.path} focusAt={focus.at} />
    </PopoutFilesFrame>
  );
}
