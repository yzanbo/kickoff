import { useEffect, useState, type ReactNode } from "react";
import { DB_NOT_IN_WORKTREE, type DbConnection } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { ApiError } from "@/api";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";
import { useDbClient } from "./dbClientContext";

/**
 * 木の 1 行（開閉の矢印・アイコン・名前・添える文）。押すと開閉か、葉なら onOpen。
 * openOnClick（テーブル・ビュー）は、名前を押すと開き（onOpen）、矢印を押す・→ / ← で中の段を開閉する
 */
export function TreeRow({
  depth,
  open,
  icon,
  label,
  note,
  title,
  className,
  openOnClick,
  onToggle,
  onOpen,
  onContextMenu,
}: {
  depth: number;
  /** 開閉できる段なら開いているか（葉は undefined） */
  open?: boolean;
  icon: ReactNode;
  label: string;
  note?: string;
  title?: string;
  className?: string;
  openOnClick?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cx("db-tree-row", className)}
      style={{ paddingLeft: 6 + depth * 14 }}
      aria-expanded={open}
      title={title}
      onClick={(e) => {
        if (openOnClick && !(e.target instanceof Element && e.target.closest(".db-tree-chevron"))) return onOpen?.();
        if (onToggle) onToggle();
        else onOpen?.();
      }}
      onDoubleClick={!openOnClick && onToggle && onOpen ? onOpen : undefined}
      onKeyDown={(e) => {
        if (!onToggle || open === undefined) return;
        if ((e.key === "ArrowRight" && !open) || (e.key === "ArrowLeft" && open)) {
          e.preventDefault();
          onToggle();
        }
      }}
      onContextMenu={onContextMenu}
    >
      <span className="db-tree-chevron">{open !== undefined && <Chevron open={open} size={12} />}</span>
      {icon}
      <span className="db-tree-label">{label}</span>
      {note && <span className="db-tree-note">{note}</span>}
    </button>
  );
}

/** 読み込みの失敗の行（ワークツリーにファイルがなければ、本体のものを開くボタン） */
export function TreeError({ depth, error, connection }: { depth: number; error: unknown; connection: DbConnection }) {
  const client = useDbClient();
  const missing = error instanceof ApiError && error.code === DB_NOT_IN_WORKTREE;
  return (
    <div className="db-tree-error" style={{ paddingLeft: 26 + depth * 14 }}>
      <span>{errorMessage(error)}</span>
      {missing && (
        <button type="button" className="link-button small" onClick={() => client.useMain(connection.id)}>
          本体のものを開く
        </button>
      )}
    </div>
  );
}

/** 開いた段の中身を読む（開いている間だけ。失敗は例外のまま持ち、行に出す。ワークツリーにないときの印 code を残すため） */
export function useNodeLoad<T>(open: boolean, load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: unknown; loading: boolean }>({ loading: open });
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    load().then(
      (value) => alive && setState({ value, loading: false }),
      (error: unknown) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...deps]);
  return state;
}

/** 読み込み中・空などの案内の行 */
export function TreeHint({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div className="db-tree-hint" style={{ paddingLeft: 26 + depth * 14 }}>
      {children}
    </div>
  );
}

/** 木の段の開閉（開いている段は置き場所ごとに覚える） */
export interface TreeOpen {
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}
