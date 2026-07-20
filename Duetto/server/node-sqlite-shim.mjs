/**
 * node:sqlite → sql.js 兼容层
 * 为 Node <22 提供 DatabaseSync API（纯 JS，无需编译）
 * 使用 ESM top-level await 确保 WASM 在首次使用前加载完成
 */
import initSqlJs from 'sql.js';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 顶层 await — 宿主 import 会等我们
const SQL = await initSqlJs({
  locateFile: file => {
    const dir = fileURLToPath(new URL('../node_modules/sql.js/dist/', import.meta.url));
    return dir + file;
  }
});

class DatabaseSync {
  #db;

  constructor(dbPath) {
    let data = null;
    try { data = fs.readFileSync(dbPath); } catch (e) { /* 新文件 */ }
    this.#db = new SQL.Database(data);
    // 关闭同步，提高写入性能
    try { this.#db.exec('PRAGMA synchronous=OFF'); } catch(e) {}
    try { this.#db.exec('PRAGMA journal_mode=OFF'); } catch(e) {}
  }

  exec(sql) {
    this.#db.exec(sql);
  }

  prepare(sql) {
    const db = this.#db;
    let stmt = null;

    return {
      all(...params) {
        stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        stmt = null;
        return rows;
      },

      get(...params) {
        stmt = db.prepare(sql);
        if (params.length) stmt.bind(params);
        let row = null;
        if (stmt.step()) row = stmt.getAsObject();
        stmt.free();
        stmt = null;
        return row || undefined;
      },

      run(...params) {
        db.run(sql, params);
      }
    };
  }

  close() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
    }
  }
}

export { DatabaseSync };
