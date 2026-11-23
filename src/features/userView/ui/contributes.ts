// userView が拡張点に出すもの（app/renderer/registry.ts が入れる）: 見ているものを知らせる殻の副作用と、チャットのタブ 5 つ・プロジェクトの画面のタブの説明
// （ほかのタブの種類の説明は持ち主が出す。projectView の持ち主 projects は userView より下、チャットのタブの持ち主 chatPanel は userView を読むと機能の大きな循環に入るので、ここで出す）
import { appHosts } from "@/foundation/ui/shell/points";
import { knownChat } from "@/features/chat/ui";
import { newChatDraft } from "@/features/composer/ui";
import { projectViewOf } from "@/features/projects/ui";
import { userViewHosts } from "./appHosts";
import { describeTab, projectViewTab, userViewTabs } from "./points";

const tabDescribers = [
  describeTab("chat", (t) => ({ kind: "chat", chat_id: t.id, title: t.title ?? knownChat(t.id)?.title ?? "", project_id: t.projectId })),
  describeTab("new", (t) => ({ kind: "new_chat", project_id: newChatDraft(t.key)?.projectId ?? 0 })),
  describeTab("subagent", (t) => ({ kind: "subagent", title: t.title })),
  describeTab("child", (t) => ({ kind: "child_chat", chat_id: t.childId, title: t.title, project_id: t.projectId })),
  describeTab("newChild", (t) => ({ kind: "page", label: "新しい子チャット（送る前）", project_id: t.projectId })),
  describeTab("projectView", (t) => projectViewTab(t.view, { projectId: t.projectId, surface: `chat-${t.chatId}` }, projectViewOf(t.view)?.label ?? t.view)),
];

export const contributes = [...userViewHosts.map((h) => appHosts.item(h)), ...tabDescribers.map((d) => userViewTabs.item(d))];
