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
    this.screen.dispose();
  }

  private schedule() {
    if (this.disposed || this.snapshots.size > 0 || !this.pending) return;
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }
}
