// 守りの設定（新しいチャットの既定。既存のチャットは変えない）。
// 形は @shared/foundation/contract/settings の setting と同じで、束ね（src/app/shared/settings.ts）の satisfies SettingTable が確かめる。
// ここで土台を読むと、chat の toolText.ts が guard を読む逆向きの辺と合わせて src/shared の兄弟の循環に guard が入るので、その辺がなくなるまでは形だけを書く

export const guardSettings = {
  /** 新しいチャットでコマンドの砂場を使う既定 */
  sandbox_enabled_by_default: { default: true as boolean, entries: false as const },
  /** 新しいチャットで Kickoff の編集先の制限を使う既定 */
  edit_scope_enabled_by_default: { default: true as boolean, entries: false as const },
};
