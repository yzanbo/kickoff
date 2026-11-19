// ログイン時に起動するか（IPC の loginItem）。値は OS の設定をそのまま読む（DB には持たない）

/** ログイン時に起動するかの様子 */
export interface LoginItemState {
  /** ログイン時に起動するか */
  openAtLogin: boolean;
  /** 切り替えられるか（開発版は Electron 本体が登録されてしまうので切り替えない） */
  available: boolean;
  /** 切り替えられない理由（切り替えられれば null） */
  reason: string | null;
}
