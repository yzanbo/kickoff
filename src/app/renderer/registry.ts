// 拡張点への登録の表: 全部の機能の ui/contributes.ts の contributes を、機能の並び順（scripts/structure.config.mjs の FEATURES）に並べて 1 回だけ入れる。
// main.tsx が、保存の片付けのあと・別ウィンドウの判定と App の読み込みの前に呼ぶ（別ウィンドウの種類の解析とパネルの保存の読み戻しが登録を要るため）
import { contributes as ai } from "@/features/ai/ui/contributes";
import { contributes as board } from "@/features/board/ui/contributes";
import { contributes as browser } from "@/features/browser/ui/contributes";
import { contributes as chat } from "@/features/chat/ui/contributes";
import { contributes as chatList } from "@/features/chatList/ui/contributes";
import { contributes as chatPanel } from "@/features/chatPanel/ui/contributes";
import { contributes as childChats } from "@/features/childChats/ui/contributes";
import { contributes as compact } from "@/features/compact/ui/contributes";
import { contributes as composer } from "@/features/composer/ui/contributes";
import { contributes as database } from "@/features/database/ui/contributes";
import { contributes as docker } from "@/features/docker/ui/contributes";
import { contributes as files } from "@/features/files/ui/contributes";
import { contributes as git } from "@/features/git/ui/contributes";
import { contributes as github } from "@/features/github/ui/contributes";
import { contributes as notes } from "@/features/notes/ui/contributes";
import { contributes as projects } from "@/features/projects/ui/contributes";
import { contributes as sidebar } from "@/features/sidebar/ui/contributes";
import { contributes as snippets } from "@/features/snippets/ui/contributes";
import { contributes as terminal } from "@/features/terminal/ui/contributes";
import { contributes as voice } from "@/features/voice/ui/contributes";
import { contributes as settings } from "@/features/settings/ui/contributes";
import { contributes as panel } from "@/features/panel/ui/contributes";
import { contributes as palette } from "@/features/palette/ui/contributes";
import { contributes as conversation } from "@/features/conversation/ui/contributes";
import { contributes as ports } from "@/features/ports/ui/contributes";
import { contributes as remoteImages } from "@/features/remoteImages/ui/contributes";
import { contributes as notifications } from "@/features/notifications/ui/contributes";
import { contributes as devices } from "@/features/devices/ui/contributes";
import { contributes as trash } from "@/features/trash/ui/contributes";
import { contributes as diagnostics } from "@/features/diagnostics/ui/contributes";
import { contributes as subagents } from "@/features/subagents/ui/contributes";
import { appCommands } from "./commands";
import { footerModeItem } from "./shell/footer/footerSettings";
import { settingsItems } from "@/features/settings/ui";
import { configureRouter } from "@/foundation/ui/navigation/router";
import { workplaceDecorItems } from "./workplaceDecor";
import { userViewTabItems } from "./userViewTabs";
import { installContributions } from "@/foundation/ui/points";
import { projectViews } from "@/features/projects/ui";
import { aiToolViews } from "@/features/chat/ui";
import { AI_TOOL_VIEWS } from "@/app/shared/aiToolViews";

/**
 * 全部の機能の登録（機能の並び順。足すときも同じ順に）・殻のコマンド（appCommands）・設定の「表示」の下の帯（footerModeItem）。作業場所の飾りは worktrees・github の分・タブの説明（userViewTabs）は全部の種類の分（持ち主へ移すまでここ）。
 * AI のツールの表示の表（src/app/shared/aiToolViews.ts）は最後。registry.test.ts が網羅を確かめる
 */
export const registryContributions = () => [
  ...settings, ...panel, ...palette, ...trash, ...projects, ...ai, ...chat, ...composer, ...snippets, ...compact, ...subagents, ...childChats, ...remoteImages, ...notifications, ...conversation, ...chatList, ...chatPanel, ...files, ...git, ...docker, ...github, ...notes, ...database, ...terminal, ...browser, ...ports, ...voice, ...devices, ...diagnostics, ...sidebar, ...board,
  ...appCommands, settingsItems.item(footerModeItem), ...workplaceDecorItems, ...userViewTabItems, ...AI_TOOL_VIEWS.map((v) => aiToolViews.item(v)),
];

export function installRegistry(): void {
  installContributions(registryContributions());
  // URL の #/projects/<id>/<画面> の画面の名前は、真ん中に置けるプロジェクトの画面の表から（この Mac のアプリの外の desktopOnly も読み、出すときにボードへ読み替える）
  configureRouter({ projectViews: projectViews.items().filter((v) => v.places.includes("center")).map((v) => v.id), defaultView: "board" });
}
