// 拡張点への登録の表: 全部の機能の ui/contributes.ts の contributes を、機能の並び順（scripts/structure.config.mjs の FEATURES）に並べて 1 回だけ入れる。
// main.tsx が、保存の片付けのあと・別ウィンドウの判定と App の読み込みの前に呼ぶ（別ウィンドウの種類の解析とパネルの保存の読み戻しが登録を要るため）
import { installContributions } from "@/foundation/ui/points";

export function installRegistry(): void {
  installContributions([
    // 各機能の段で、並び順に ...<機能>Contributes を足す
  ]);
}
