// サービスの行のポート: Mac に出しているポートのボタンと、静かなぶつかり（Docker の外のプロセスも同じポートを待っている）の行
import { TriangleAlert } from "lucide-react";
import type { DockerSilentConflict } from "@shared/docker/types";
import { useExternalBrowser } from "@/foundation/ui/external/externalApps";
import { open } from "@/foundation/ui/navigation/open";
import { cx } from "@/foundation/ui/lib/cx";
import { confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { showToast } from "@/foundation/ui/kit/toast";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { dockerApi } from "./api/docker";
import { silentText } from "./dockerView";

/** Mac に出しているポート（押すとパネルのブラウザ、右クリックで外部のブラウザ・URL のコピー・DB のサービスなら DB で開く）。静かなぶつかりがあれば ⚠ */
export function PortButton({ projectId, port, warn, onOpenDb }: { projectId: number; port: number; warn: boolean; onOpenDb: (() => void) | null }) {
  const menu = useContextMenu();
  const browser = useExternalBrowser();
  const url = `http://localhost:${port}`;
  return (
    <>
      <button
        type="button"
        className={cx("docker-port small", warn && "is-warn")}
        data-tip={`${url} を右サイドバーのブラウザで開く`}
        onClick={() => open({ kind: "browser", projectId, url })}
        onContextMenu={(e) => {
          // 行の右クリックのメニューまで開かないように
          e.stopPropagation();
          menu.open(e);
        }}
      >
        :{port}
        {warn && " ⚠"}
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`:${port}`} onClose={menu.close}>
          <MenuItem onSelect={() => browser.open(url)}>外部のブラウザで開く（{browser.label}）</MenuItem>
          <MenuItem onSelect={() => void navigator.clipboard.writeText(url).catch(reportFailure("コピーできませんでした"))}>URL をコピー</MenuItem>
          {onOpenDb && <MenuItem onSelect={onOpenDb}>DB で開く</MenuItem>}
        </PopupMenu>
      )}
    </>
  );
}

/** 静かなぶつかり 1 つ（［Docker の外の … を使う］= コンテナを止める・［Docker の … を使う］= 相手の Homebrew のサービスを止める） */
export function SilentConflictRow({
  projectId,
  service,
  conflict: x,
  busy,
  onStopContainer,
}: {
  projectId: number;
  service: string;
  conflict: DockerSilentConflict & { container: string };
  busy: boolean;
  onStopContainer: () => void;
}) {
  return (
    <div className="docker-silent small">
      <TriangleAlert size={13} aria-hidden />
      <span className="docker-silent-text">{silentText(x)}</span>
      <button type="button" className="btn" data-size="sm" disabled={busy} data-tip={`Docker の ${service} を止めます（データは残ります）`} onClick={onStopContainer}>
        Docker の外の {x.process} を使う
      </button>
      {x.brew_service && (
        <button type="button" className="btn" data-size="sm" data-tip={`Homebrew のサービス ${x.brew_service} を止めます（確かめてから）`} onClick={() => void chooseDockerSide(projectId, service, x.port, x.brew_service!)}>
          Docker の {service} を使う
        </button>
      )}
    </div>
  );
}

/** 静かなぶつかりの［Docker の db を使う］: 確かめてから相手の Homebrew のサービスを止め、戻し方を知らせる */
async function chooseDockerSide(projectId: number, service: string, port: number, brew: string) {
  const ok = await confirm({
    title: `${brew} を止めますか？`,
    message: `Homebrew のサービスです。ほかのプロジェクトも使っていることがあります。止めると localhost:${port} への接続は Docker の ${service} に届きます。戻すときは brew services start ${brew} を流します。`,
    confirmLabel: "止める",
    danger: true,
  });
  if (!ok) return;
  try {
    const { message } = await dockerApi.dockerBrewStop(projectId, brew);
    showToast(message, { label: "戻すコマンドをコピー", run: () => void navigator.clipboard.writeText(`brew services start ${brew}`) });
  } catch (e) {
    reportFailure(`${brew} を止められませんでした`)(e);
  }
}
