import { useServerEvents } from "./api";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";
import { href, useRoute } from "./router";

export function App() {
  const route = useRoute();
  const connection = useServerEvents(() => {
    // M1 以降でプロジェクト・タスクの更新を反映する
  });

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" href={href({ name: "home" })}>
            Kickoff
          </a>
        </div>
        <nav className="sidebar-section">
          <div className="sidebar-label">プロジェクト</div>
          <p className="sidebar-empty">まだありません</p>
        </nav>
        <div className="sidebar-footer">
          <a className={`nav-item ${route.name === "settings" ? "active" : ""}`} href={href({ name: "settings" })}>
            設定
          </a>
          <span className={`conn conn-${connection}`} title={CONNECTION_LABELS[connection]}>
            {CONNECTION_LABELS[connection]}
          </span>
        </div>
      </aside>
      <main className="main">{route.name === "settings" ? <SettingsPage /> : <HomePage />}</main>
    </div>
  );
}

const CONNECTION_LABELS = { connecting: "接続中…", open: "接続済み", closed: "切断" } as const;
