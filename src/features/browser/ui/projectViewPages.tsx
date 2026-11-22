// browser がプロジェクトの画面の表（projectViews）に出す画面の中身
import { Panel, usePanel } from "@/features/panel/ui";
import type { ProjectViewContext } from "@/features/projects/ui";

/**
 * 右サイドバーのブラウザのタブ（欄 side。開いているかは右サイドバーの殻と同じ店から読む）。右サイドバーの別ウィンドウも同じものを描く。
 * 欄ごと別ウィンドウへ移すボタンは置かない（タブは右クリック・ウィンドウの外へのドラッグで 1 つずつ別ウィンドウで開ける）。
 * frame: 横幅いっぱいの切り替え（メインのウィンドウだけ。別ウィンドウはウィンドウの大きさで決まるので渡さない）
 */
export function BrowserViewPage({ project, frame }: ProjectViewContext) {
  // ブラウザだけの欄なので、新しいチャット・ターミナルの開く場所は渡さない
  const panel = usePanel("side", project.id);
  return <Panel panel={panel} frame={frame} />;
}
