import headless from "@xterm/headless";
import serialize from "@xterm/addon-serialize";

/** 出力をまとめて送るまでの時間 */
const FLUSH_MS = 8;
/** 裏の端末に残す行数（つなぎ直したときに遡れる分） */
const SCROLLBACK = 5000;

/**
 * 1 つのシェルの出力。裏の端末（@xterm/headless）に書いておき、つなぎ直したときの画面の内容（snapshot）にする。
 * 画面へは、細かく届く出力をまとめて送る。Electron・node-pty に依らない（テストする）。
 *
 * 画面は open の返事が届くまでの出力を捨てる（返事の snapshot に入っているはずなので）。そのため snapshot は、
 * 裏の端末が書いた分を読み終えるのを待ってから取り（write は非同期で、すぐに取ると直前の出力が入らない）、
 * 取り始めてから返すまでに届いた出力は、送らずにためて返したあとに送る
 */
export class TerminalOutput {
  private readonly screen: InstanceType<typeof headless.Terminal>;
  private readonly serializer: InstanceType<typeof serialize.SerializeAddon>;
  /** 画面へまだ送っていない出力 */
  private pending = "";
  private timer?: ReturnType<typeof setTimeout>;
  /** 取っている途中の snapshot（その間は送らない。止めたときに待たせたままにしない） */
  private readonly snapshots = new Set<(text: string) => void>();
  private disposed = false;
  /** 書いた分を読み終えるのを待っている読み取り（止めたときに待たせたままにしない） */
  private readonly waits = new Set<(ok: boolean) => void>();

  constructor(
    private readonly send: (data: string) => void,
    size: { cols: number; rows: number },
  ) {
    this.screen = new headless.Terminal({ ...size, scrollback: SCROLLBACK, allowProposedApi: true });
    this.serializer = new serialize.SerializeAddon();
    this.screen.loadAddon(this.serializer);
  }

  /** シェルの出力（裏の端末に書き、まとめて画面へ送る） */
  write(data: string) {
    if (this.disposed) return;
    this.screen.write(data);
    this.pending += data;
    this.schedule();
  }

  /** ためている出力を、いま画面へ送る（シェルが終わったときなど） */
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.snapshots.size > 0 || !this.pending) return;
    const data = this.pending;
    this.pending = "";
    this.send(data);
  }

  /**
   * いまの画面の内容（それまでに書いた出力をすべて含む）。それまでの出力は snapshot に入るので画面へは送らず、
   * 取っている間に届いた出力は、返したあとに送る（タイマーで送るので、invoke の返事より後に届く）
   */
  async snapshot(): Promise<string> {
    if (this.disposed) return "";
    this.pending = "";
    clearTimeout(this.timer);
    this.timer = undefined;
    let done!: (text: string) => void;
    const taken = new Promise<string>((resolve) => (done = resolve));
    this.snapshots.add(done);
    // 空の書き込みの知らせは、それより前に書いた分を読み終えたときに届く（そのあとに書いた分はまだ入っていない）
    this.screen.write("", () => {
      if (!this.disposed) done(this.serializer.serialize());
    });
    try {
      return await taken;
    } finally {
      this.snapshots.delete(done);
      this.schedule();
    }
  }

  /**
   * 裏の端末に残っている最後の max 行（折り返しをつないだ 1 行ずつ。色などの印は入らない。終わりの空行は落とす）と、残っている行の数。
   * AI がターミナルの出力を読むときに使う。それまでに書いた出力を読み終えてから数える
   */
  async tail(max: number): Promise<{ lines: string[]; total: number }> {
    if (!(await this.written())) return { lines: [], total: 0 };
    const buffer = this.screen.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (!line) continue;
      // 折り返した続きの行は前の行につなぐ（つなぎ目の空白を落とさないよう、行の右の空白はつないだあとで落とす）
      const text = line.translateToString(false);
      if (line.isWrapped && lines.length > 0) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    const trimmed = lines.map((l) => l.trimEnd());
    while (trimmed.length > 0 && trimmed.at(-1) === "") trimmed.pop();
    return { lines: trimmed.slice(-Math.max(1, max)), total: trimmed.length };
  }

  resize(cols: number, rows: number) {
    this.screen.resize(cols, rows);
  }

  /** 止める（取っている途中の snapshot は空で返し、ためている出力は捨てる） */
  dispose() {
    this.disposed = true;
    this.pending = "";
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const done of this.snapshots) done("");
    for (const done of this.waits) done(false);
    this.screen.dispose();
  }

  /** それまでに書いた出力を裏の端末が読み終えたら true（止めたら false） */
  private written(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        this.waits.delete(done);
        resolve(ok);
      };
      this.waits.add(done);
      this.screen.write("", () => done(!this.disposed));
    });
  }

  private schedule() {
    if (this.disposed || this.snapshots.size > 0 || !this.pending) return;
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }
}
