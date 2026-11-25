import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { openInDefaultBrowser } from "./native";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel" | "onClick" | "onAuxClick"> & { href: string };

/**
 * アプリが作った外のページ（GitHub の URL など）へのリンク。押す（左・中クリック）と、確かめずに既定のブラウザで開く（openInDefaultBrowser）。
 * 窓の既定の動き（窓の移動・新しいウィンドウの要求）は止める。本文に書かれたリンクには使わない（確認を通す Markdown のリンク・openWebLink）
 */
export function ExternalAnchor({ href, ...rest }: Props) {
  const activate = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    openInDefaultBrowser(href);
  };
  return <a {...rest} href={href} rel="noreferrer" onClick={activate} onAuxClick={activate} />;
}
