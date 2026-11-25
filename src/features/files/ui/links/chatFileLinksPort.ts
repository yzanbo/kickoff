// チャットの口 chatFileLinks の files の実装（ui/contributes.ts が登録する）: 作業場所のファイルの一覧から、会話の中のファイルのリンクを作って配る
import type { ChatFileLinksPort, ChatFileSource } from "@/features/chat/ui";
import { popoutFileLinks } from "@/features/files/ui/PopoutFiles";
import { isCommonProjectId } from "@/features/projects/ui";
import { FileLinksProvider } from "./FileLinksProvider";
import { fileLinksFor, useFileLinks, type FileLinkSource } from "./useFileLinks";

/** 口の元は files が作ったものだけ */
const own = (source: ChatFileSource) => source as FileLinkSource;

export const filesChatFileLinks: ChatFileLinksPort = {
  Provider: FileLinksProvider,
  useSource: useFileLinks,
  sourceFor: (place, files) => fileLinksFor({ files, root: place.root, projectId: place.projectId, worktree: place.worktree, chatId: place.chatId, side: place.side, common: isCommonProjectId(place.projectId) }),
  // チップはいまの一覧の名前で出し（作業場所のフォルダはそのときのもの。変更カードの絶対パスも作業場所の中として読む）、押すと開けないと知らせる
  goneSource: (current, root, tell) => {
    const links = own(current);
    return { index: { ...links.index, root: root ?? links.index.root }, side: links.side, common: links.common, open: tell, openInEditor: links.openInEditor && tell, openChanges: tell } satisfies FileLinkSource;
  },
  popout: (source, place) => popoutFileLinks(own(source), place),
};
