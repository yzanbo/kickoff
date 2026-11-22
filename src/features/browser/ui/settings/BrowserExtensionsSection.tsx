import { BrowserExtensions } from "@/features/browser/ui/BrowserExtensions";

/** 設定の「ブラウザの拡張機能」の節（見出しは節の名前） */
export function BrowserExtensionsSection() {
  return (
    <section className="section">
      <h2>ブラウザの拡張機能</h2>
      <BrowserExtensions />
    </section>
  );
}
