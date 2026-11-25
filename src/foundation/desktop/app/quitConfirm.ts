// 作業中のチャットがあるときに、終了してよいかを聞くダイアログの文

/** ダイアログに名前を並べるチャットの数（超えた分は「ほか n 件」） */
const LISTED_CHATS = 5;

/** 終了してよいかを聞くダイアログの見出しと本文（作業中のチャットの名前を LISTED_CHATS 件まで並べる） */
export function quitConfirmText(chats: readonly { title: string }[]): { message: string; detail: string } {
  const names = chats.slice(0, LISTED_CHATS).map((c) => `・${c.title}`);
  const rest = chats.length - LISTED_CHATS;
  return {
    message: `作業中のチャットが ${chats.length} 件あります`,
    detail: [...names, ...(rest > 0 ? [`ほか ${rest} 件`] : []), "", "終了すると作業が止まります。次に起動したときに、続けるかを聞きます。"].join("\n"),
  };
}

/** 終了が決まるまで片付けを始めない。確認中にもう一度終了を頼まれたら、そのまま終える。 */
export function createQuitRequest<Core>({ running, confirm, close }: {
  running(core: Core): Promise<{ title: string }[]>;
  confirm(chats: { title: string }[]): Promise<boolean>;
  close(core: Core): void;
}) {
  let closing = false;
  let asking = false;
  return async (core: Core, skipConfirm: boolean): Promise<void> => {
    if (closing) return;
    const finish = () => {
      closing = true;
      close(core);
    };
    if (skipConfirm || asking) return finish();
    asking = true;
    try {
      const chats = await running(core).catch(() => []);
      if (closing) return;
      const quit = chats.length === 0 || (await confirm(chats));
      if (quit && !closing) finish();
    } finally {
      asking = false;
    }
  };
}
