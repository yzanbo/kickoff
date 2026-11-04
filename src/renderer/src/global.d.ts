/// <reference types="vite/client" />
import type { KickoffNativeApi } from "../../preload";

declare global {
  interface Window {
    /** デスクトップアプリでのみ存在するネイティブ機能 */
    kickoff?: KickoffNativeApi;
  }
}

// Electron の <webview>（埋め込みブラウザ）を JSX で使えるようにする
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        ref?: React.Ref<import("electron").WebviewTag | null>;
      };
    }
  }
}

export {};
