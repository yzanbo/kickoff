import { useServerEvents } from "./api";
import { UsageMeter } from "./components/UsageMeter";
import { HomePage } from "./pages/HomePage";
import { SettingsPage } from "./pages/SettingsPage";
import { href, useRoute } from "./router";
import { FIVE_HOUR_IDLE, usePlanUsage } from "./usage";

export function App() {
  const route = useRoute();
  const planUsage = usePlanUsage();
  const connection = useServerEvents((event) => {
    planUsage.onEvent(event);
  });
  const { usage } = planUsage;

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
        {usage?.available && (
          <a className="sidebar-usage" href={href({ name: "home" })} title="使用状況の詳細">
            <UsageMeter window={usage.five_hour} compact idleText={FIVE_HOUR_IDLE} />
            <UsageMeter window={usage.seven_day} compact />
          </a>
        )}
        <div className="sidebar-footer">
          <a className={`nav-item ${route.name === "settings" ? "active" : ""}`} href={href({ name: "settings" })}>
            設定
          </a>
          <span className={`conn conn-${connection}`} title={CONNECTION_LABELS[connection]}>
            {CONNECTION_LABELS[connection]}
          </span>
        </div>
      </aside>
      <main className="main">
        {route.name === "settings" ? <SettingsPage /> : <HomePage planUsage={planUsage} />}
      </main>
    </div>
  );
}

const CONNECTION_LABELS = { connecting: "接続中…", open: "接続済み", closed: "切断" } as const;
