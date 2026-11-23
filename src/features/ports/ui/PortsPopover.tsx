import { useEffect, useState, type RefObject } from "react";
import { TriangleAlert } from "lucide-react";
import { PORT_ORIGIN_HINTS, type PortProcess } from "@shared/ports/types";
import { workplaceText } from "@shared/foundation/workplace";
import { navigate, routeProjectId, useRoute } from "@/foundation/ui/navigation/router";
import { open } from "@/foundation/ui/navigation/open";
import { useExternalBrowser } from "@/foundation/ui/external/externalApps";
import { useProjects } from "@/features/projects/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { Popover } from "@/foundation/ui/kit/Popover";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { portsApi } from "./api/ports";
import { refreshPorts, usePorts } from "./portsStore";
import { bandText, originText, portUrl, stopTargetText, uptimeText } from "./portsText";

/** 止めている様子（止めている間 / 待っても終わらなかった = 「強制終了」を出す） */
type StopState = "stopping" | "stuck";

/**
 * プロジェクトの右サイドバー（チャット欄）のブラウザで開く（ほかのプロジェクトなら、そのプロジェクトへ移ってから。
 * 欄ができるのは待たない: 開く口は欄の店へ入れ、欄が出たときにそのタブを出す。右サイドバーを別ウィンドウへ移していれば、そのウィンドウに頼む）
 */
function openInPanel(projectId: number, url: string, current: number | null) {
  if (current !== projectId) navigate({ name: "project", id: projectId, tab: "board" });
  open({ kind: "browser", projectId, url });
}

interface Props {
  /** 開いた下の帯のボタン（その左端にそろえて上に出す） */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/** 下の帯の「ポート n」を押したときの窓: Kickoff のプロジェクトのフォルダで、ポートを開いているプロセス（全プロジェクト） */
export function PortsPopover({ anchor, onClose }: Props) {
  const { data } = usePorts();
  const [stops, setStops] = useState<Record<number, StopState>>({});
  // 調べている最中か（開いたとき・↻）
  const [checking, setChecking] = useState(true);
  const check = (onError?: (e: unknown) => void) => {
    setChecking(true);
    refreshPorts()
      .catch(onError ?? (() => undefined))
      .finally(() => setChecking(false));
  };
  // 開いたら調べ直して、点を消す
  useEffect(() => check(), []);
  const processes = data ?? [];

  const stop = async (p: PortProcess, force: boolean, projectName: string) => {
    if (!force) {
      const ok = await confirm({
        title: `${stopTargetText(p, projectName)}を止めます`,
        message: "終わるよう合図を送ります（SIGTERM）。止まらなければ、強制終了できます。",
        confirmLabel: "止める",
        danger: true,
      });
      if (!ok) return;
    }
    setStops((s) => ({ ...s, [p.pid]: "stopping" }));
    try {
      const { stopped } = await portsApi.stopPortProcess({ pid: p.pid, command: p.command_full, force });
      setStops((s) => (stopped ? withoutPid(s, p.pid) : { ...s, [p.pid]: "stuck" }));
    } catch (e) {
      setStops((s) => withoutPid(s, p.pid));
      reportFailure("止められませんでした")(e);
    }
  };

  return (
    <Popover
      anchor={anchor}
      side="above"
      gap={8}
      portal
      escape="pass"
      title="ポートを使っているプロセス"
      refresh={{ label: "調べ直す", title: "調べ直す", busy: checking, onClick: () => check(reportFailure("調べられませんでした")) }}
      label="ポートを使っているプロセス"
      className="ports-popover"
      onClose={onClose}
    >
      {processes.length === 0 ? (
        <p className="muted small ports-empty">{checking && !data ? "調べています…" : "プロジェクトのフォルダでポートを開いているプロセスはありません"}</p>
      ) : (
        <ul className="ports-list">
          {processes.map((p) => (
            <PortRow key={p.pid} process={p} stopState={stops[p.pid]} onStop={stop} />
          ))}
        </ul>
      )}
    </Popover>
  );
}

/** pid の止め方の様子を外した写し */
function withoutPid(stops: Record<number, StopState>, pid: number): Record<number, StopState> {
  const rest = { ...stops };
  delete rest[pid];
  return rest;
}

function PortRow({
  process: p,
  stopState,
  onStop,
}: {
  process: PortProcess;
  stopState: StopState | undefined;
  onStop: (p: PortProcess, force: boolean, projectName: string) => void;
}) {
  const { projectName } = useProjects();
  const current = routeProjectId(useRoute());
  const browser = useExternalBrowser();
  const menu = useContextMenu();
  const name = projectName(p.project_id);
  const url = portUrl(p.ports[0]);
  const copy = (text: string) => void navigator.clipboard.writeText(text).catch(reportFailure("コピーできませんでした"));
  const openPort = (port: number) => openInPanel(p.project_id, portUrl(port), current);
  return (
    <li
      className="ports-row"
      onContextMenu={(e) => {
        // 窓は下の帯の中の部品なので、下の帯の右クリックのメニュー（帯の出し方）まで開かないように
        e.stopPropagation();
        menu.open(e);
      }}
    >
      <div className="ports-main">
        <span className="ports-ports">
          {p.ports.map((port) => (
            <button key={port} type="button" className="ports-port" data-tip={`${portUrl(port)} を右サイドバーのブラウザで開く`} onClick={() => openPort(port)}>
              :{port}
            </button>
          ))}
        </span>
        <span className="ports-command" data-tip={p.command_full}>
          {p.command}
        </span>
        <span className="ports-project">{name}</span>
        <span className="ports-place">{workplaceText(p.worktree_path, p.branch)}</span>
        <span className="ports-uptime muted">{uptimeText(p.uptime_seconds)}</span>
        <span className={cx("ports-origin", p.origin === "detached" && "is-detached")} data-tip={PORT_ORIGIN_HINTS[p.origin]}>
          {originText(p)}
        </span>
        <span className="ports-actions">
          <button type="button" className="btn" data-size="sm" onClick={() => openPort(p.ports[0])}>
            開く
          </button>
          {stopState === "stuck" ? (
            <button type="button" className="btn btn-danger" data-size="sm" data-tip="すぐに止めます（SIGKILL）。保存していないものは消えます" onClick={() => onStop(p, true, name)}>
              強制終了
            </button>
          ) : (
            <button type="button" className="btn" data-size="sm" disabled={stopState === "stopping"} onClick={() => onStop(p, false, name)}>
              {stopState === "stopping" ? "止めています…" : "止める"}
            </button>
          )}
        </span>
      </div>
      {stopState === "stuck" && <p className="ports-note is-warn">止まりませんでした。強制終了できます</p>}
      {p.bands.map((b) => (
        <p key={b.port} className={cx("ports-note", b.mismatch && "is-warn")} data-tip={b.mismatch ? `このままだと ${b.label} の開発サーバー・コンテナがこの番号で起動できません` : undefined}>
          {b.mismatch && <TriangleAlert size={12} aria-hidden />}:{b.port} は {bandText(b)}
        </p>
      ))}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`${p.command}（:${p.ports[0]}）`} onClose={menu.close}>
          <MenuItem onSelect={() => browser.open(url)}>外部のブラウザで開く（{browser.label}）</MenuItem>
          <MenuItem onSelect={() => copy(url)}>URL をコピー</MenuItem>
          <MenuItem onSelect={() => copy(String(p.pid))}>PID をコピー（{p.pid}）</MenuItem>
        </PopupMenu>
      )}
    </li>
  );
}
