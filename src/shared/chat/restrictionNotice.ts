/**
 * チャットに効く制限（コマンドのサンドボックス・編集先の制限）。共通のチャット（共通のノートのチャットも）は、チャットの切り替え・アプリの既定によらずどちらもいつも効く
 * （利用者のプロジェクトのコードを直接書かせない）。コアの守りと実行・入力欄の知らせ・スマホで同じ判定にする
 */
export function chatRestrictions(chat: { sandbox_enabled: boolean; edit_scope_enabled: boolean }, common: boolean): { sandboxEnabled: boolean; editScopeEnabled: boolean } {
  return { sandboxEnabled: chat.sandbox_enabled || common, editScopeEnabled: chat.edit_scope_enabled || common };
}

/** 制限をオフにしたチャットの入力欄に出す文（画面とスマホで同じ内容） */
export function restrictionNotice(sandboxEnabled: boolean | undefined, editScopeEnabled: boolean | undefined, draft = false): string {
  const off = [sandboxEnabled === false ? "コマンドのサンドボックス" : null, editScopeEnabled === false ? "編集先の制限" : null].filter((label): label is string => label !== null);
  if (!off.length) return "";
  return `${draft ? "新しいチャットの既定" : "このチャット"}: ${off.join("・")}は通常時オフです。計画モードなどでは別の制限がかかります。`;
}
