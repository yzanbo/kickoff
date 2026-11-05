import type { ReactNode } from "react";
import { Elapsed } from "./Elapsed";

/** 「考えています」などの、エージェントが動いている印。since があれば、そこからの経過時間を添える（ツールの実行中も数える） */
export function Working({ children, since }: { children: ReactNode; since?: string | null }) {
  return (
    <div className="working">
      <span className="dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {children}
      {since && <Elapsed since={since} className="working-elapsed" />}
    </div>
  );
}
