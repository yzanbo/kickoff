import "./WindowHeaderContent.css";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/foundation/ui/kit/layout/useMediaQuery";

const HeaderHost = createContext<{
  host: HTMLElement | null;
  setHost: (host: HTMLElement | null) => void;
  shown: boolean;
} | null>(null);

/** 最大表示した欄の上の操作行を、プロジェクト情報の共通ヘッダーとして使う */
export function MaximizedHeader({ active, children }: { active: boolean; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  // 右サイドバーを出さない縦 1 列では、見出しも元の画面の中に置く
  const wide = useMediaQuery("(min-width: 721px)");
  const shown = active && wide;
  return (
    <HeaderHost.Provider value={{ host, setHost, shown }}>
      {children}
    </HeaderHost.Provider>
  );
}

/** 欄のドラッグ領域より後、左上・右上の固定ボタンより前に置く */
export function MaximizedHeaderBar() {
  const target = useContext(HeaderHost);
  return target?.shown ? <header ref={(element) => target.setHost(element)} className="maximized-header page-header" aria-label="プロジェクト情報" /> : null;
}

/** 同じ見出しと操作を移す。通常表示では元の位置に戻し、データや設定の状態は二重に持たない */
export function WindowHeaderContent({ children }: { children: ReactNode }) {
  const target = useContext(HeaderHost);
  return target?.shown && target.host ? createPortal(children, target.host) : children;
}
