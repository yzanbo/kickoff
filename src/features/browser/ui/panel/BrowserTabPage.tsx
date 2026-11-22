// ブラウザのタブの中身（右サイドバー・ブラウザの別ウィンドウ。種類の項目は tabKind.ts）
import { projectOfPanel, type PanelTab, type TabPageProps } from "@/features/panel/ui";
import { BrowserPane } from "@/features/browser/ui/BrowserPane";

export function BrowserPage({ tab: t, panel, visible }: TabPageProps<Extract<PanelTab, { kind: "browser" }>>) {
  return (
    <BrowserPane
      url={t.current ?? t.url}
      visible={visible}
      onOpenTab={(url, background) => {
        // クリックしたブラウザのペインに足し、リンク・画像なら今のタブを表示したままにする
        panel.showTab(t.key);
        if (background) panel.addBrowserBehind(url);
        else panel.openBrowser(url);
      }}
      // AI に操作させるため、どのパネルのどのタブかをメインプロセスに登録する（プロジェクトの欄でなければプロジェクトは null）
      agentTarget={{ tabKey: t.key, projectId: projectOfPanel(panel.key) }}
      // 空のページのあいだは「新しいタブ」と表示する
      onChange={({ url, title }) => panel.patchTab(t.key, { kind: "browser", fields: { title: url === "about:blank" ? "" : title, current: url } })}
    />
  );
}
