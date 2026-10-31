/// <reference types="vite/client" />
import type { KickoffNativeApi } from "../../preload/index";

declare global {
  interface Window {
    /** デスクトップアプリでのみ存在するネイティブ機能 */
    kickoff?: KickoffNativeApi;
  }
}

export {};
