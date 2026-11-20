// 拡張点への登録の表: 全部の機能の ui/contributes.ts の contributes を、機能の並び順（scripts/structure.config.mjs の FEATURES）に並べて 1 回だけ入れる。
// main.tsx が、保存の片付けのあと・別ウィンドウの判定と App の読み込みの前に呼ぶ（別ウィンドウの種類の解析とパネルの保存の読み戻しが登録を要るため）
import { contributes as chat } from "@/features/chat/ui/contributes";
import { contributes as chatPanel } from "@/features/chatPanel/ui/contributes";
import { contributes as files } from "@/features/files/ui/contributes";
import { contributes as notes } from "@/features/notes/ui/contributes";
import { contributes as projects } from "@/features/projects/ui/contributes";
import { configureRouter } from "@/foundation/ui/navigation/router";
import { contributes as popouts } from "./popout/contributes";
import { workplaceDecorItems } from "./workplaceDecor";
import { installContributions } from "@/foundation/ui/points";

/** プロジェクトの画面（タブ）の ID（URL の #/projects/<id>/<画面>。プロジェクトの画面の拡張点 projectViews ができたら、そこから作る） */
const PROJECT_VIEWS = ["board", "chats", "files", "search", "changes", "history", "notes", "db", "github", "docker", "ci", "trash"];

export function installRegistry(): void {
  configureRouter({ projectViews: PROJECT_VIEWS, defaultView: "board" });
  // 機能の並び順（足すときも同じ順に）。作業場所の飾りは worktrees・github の分（持ち主へ移すまでここ）。殻がまとめて出すもの（別ウィンドウの種類）は最後
  installContributions([...projects, ...chat, ...chatPanel, ...files, ...notes, ...workplaceDecorItems, ...popouts]);
}
