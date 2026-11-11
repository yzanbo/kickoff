// AI が流した SQL の結果を、行の数によらず CSV のファイルに書き出す（ワーカーの中。行は 1 行ずつ受けて書くので、メモリに全部を持たない）。
// 頭の行（head_rows）までは AI に直接返し、それを超えたときだけファイルを作って、頭の行から全部を書く
import fs from "node:fs";
import path from "node:path";
import type { DbExportResult } from "../protocol.js";
import type { DbColumns, DbDriver } from "./driver.js";
import { toDbValue } from "./values.js";

/** CSV の 1 つのセル（NULL は空・バイナリは \x と 16 進のすべて。区切り・"・改行・頭や後ろの空白を含むものだけ "…" で囲む） */
export function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const text = raw instanceof Uint8Array ? `\\x${Buffer.from(raw).toString("hex")}` : String(toDbValue(raw) ?? "");
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** 書き出し先（初めて書くときにフォルダとファイルを作る。ほかの利用者に読ませない） */
class CsvFile {
  private fd: number | null = null;
  private buffer: string[] = [];
  private size = 0;

  constructor(private readonly file: string) {}

  write(cells: unknown[]) {
    const line = `${cells.map(csvCell).join(",")}\n`;
    this.buffer.push(line);
    this.size += line.length;
    if (this.size >= 64 * 1024) this.flush();
  }

  flush() {
    if (this.buffer.length === 0) return;
    if (this.fd === null) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      this.fd = fs.openSync(this.file, "wx", 0o600);
    }
    fs.writeSync(this.fd, this.buffer.join(""));
    this.buffer = [];
    this.size = 0;
  }

  close() {
    this.flush();
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
  }

  /** 途中で失敗したら、書きかけのファイルを消す */
  discard() {
    if (this.fd !== null) fs.closeSync(this.fd);
    this.fd = null;
    fs.rmSync(this.file, { force: true });
  }
}

/** 1 つの文を流し、頭の headRows 行を返す。超えたら file に CSV（1 行目は列の名前）ですべての行を書く */
export async function exportQuery(driver: DbDriver, sql: string, file: string, headRows: number): Promise<DbExportResult> {
  const started = performance.now();
  let columns: DbColumns = [];
  const head: unknown[][] = [];
  let total = 0;
  let out: CsvFile | null = null;
  try {
    const { affected } = await driver.stream(
      sql,
      (cols) => (columns = cols),
      (row) => {
        total++;
        if (total <= headRows) return void head.push(row);
        if (!out) {
          out = new CsvFile(file);
          out.write(columns.map((c) => c.name));
          for (const r of head) out.write(r);
        }
        out.write(row);
      },
    );
    (out as CsvFile | null)?.close();
    return {
      columns,
      rows: head.map((r) => r.map(toDbValue)),
      total_rows: total,
      file: out ? file : null,
      affected,
      duration_ms: performance.now() - started,
    };
  } catch (e) {
    (out as CsvFile | null)?.discard();
    throw e;
  }
}
