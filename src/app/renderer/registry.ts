// 拡張点への登録の表: 全部の機能の ui/contributes.ts の contributes を、機能の並び順（scripts/structure.config.mjs の FEATURES）に並べて 1 回だけ入れる。
// main.tsx が、保存の片付けのあと・別ウィンドウの判定と App の読み込みの前に呼ぶ（別ウィンドウの種類の解析とパネルの保存の読み戻しが登録を要るため）
import { configureRouter } from "@/foundation/ui/navigation/router";
import { installContributions } from "@/foundation/ui/points";

/** プロジェクトの画面（タブ）の ID（URL の #/projects/<id>/<画面>。プロジェクトの画面の拡張点 projectViews ができたら、そこから作る） */
const PROJECT_VIEWS = ["board", "chats", "files", "search", "changes", "history", "notes", "db", "github", "docker", "ci", "trash"];

export function installRegistry(): void {
  configureRouter({ projectViews: PROJECT_VIEWS, defaultView: "board" });
  installContributions([
    // 各機能の段で、並び順に ...<機能>Contributes を足す
  ]);
}
