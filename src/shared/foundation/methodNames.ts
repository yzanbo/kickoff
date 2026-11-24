// 口（interface）の操作の名前の一覧を、漏れなく書いたかを型で確かめて作る（RPC の写しが、名前を回して口を作るため）

/** names は口の操作を 1 つずつ true で並べたもの（足りない・知らない名前は型検査で落ちる）。返すのは名前の一覧 */
export const methodNames = <T>(names: { [K in keyof T & string]: true }): (keyof T & string)[] => Object.keys(names) as (keyof T & string)[];
