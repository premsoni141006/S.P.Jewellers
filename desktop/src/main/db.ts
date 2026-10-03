// Local SQLite database (sql.js — SQLite compiled to WebAssembly, so there is no native
// module to rebuild for Windows). The whole database lives in one file in the user's
// app-data folder and is rewritten atomically (temp file + rename) after every change.

import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import {
  DEFAULT_SETTINGS,
  SAMPLE_PRODUCTS,
  calcEstimate,
  type Estimate,
  type EstimateItem,
  type EstimateSummary,
  type Product,
  type ShopSettings,
} from '@shared';
import { DEFAULT_PRINTER_CONFIG, type PrinterConfig } from './printing/types';

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS estimates (
  id               TEXT PRIMARY KEY,
  number           INTEGER NOT NULL UNIQUE,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  customer_name    TEXT NOT NULL DEFAULT '',
  customer_phone   TEXT NOT NULL DEFAULT '',
  pricing_json     TEXT NOT NULL,
  other_charges_json TEXT NOT NULL DEFAULT '[]',
  grand_total      REAL NOT NULL DEFAULT 0,
  print_status     TEXT NOT NULL DEFAULT 'not_printed',
  printed_at       TEXT,
  last_print_error TEXT
);
CREATE TABLE IF NOT EXISTS estimate_items (
  id              TEXT PRIMARY KEY,
  estimate_id     TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  description     TEXT NOT NULL,
  metal           TEXT NOT NULL,
  gross_wt        REAL NOT NULL,
  less_wt         REAL NOT NULL,
  tunch           REAL NOT NULL,
  wastage         REAL NOT NULL,
  pcs             INTEGER NOT NULL,
  pcs_unit        TEXT NOT NULL DEFAULT 'pc',
  labour_rate     REAL NOT NULL,
  labour_mode     TEXT NOT NULL,
  amount_override REAL
);
CREATE INDEX IF NOT EXISTS idx_items_estimate ON estimate_items(estimate_id, position);
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  position    INTEGER NOT NULL,
  name        TEXT NOT NULL,
  metal       TEXT NOT NULL,
  tunch       REAL NOT NULL,
  wastage     REAL NOT NULL,
  labour_rate REAL NOT NULL,
  labour_mode TEXT NOT NULL,
  pcs_unit    TEXT NOT NULL DEFAULT 'pc'
);
CREATE TABLE IF NOT EXISTS print_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  estimate_id TEXT,
  at          TEXT NOT NULL,
  printer     TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  message     TEXT NOT NULL
);
`;

type Row = Record<string, SqlValue>;

export class Store {
  private constructor(
    private db: Database,
    private readonly file: string,
  ) {}

  static async open(dir: string, wasmBinary: ArrayBuffer): Promise<Store> {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'spj.sqlite');
    const SQL = await initSqlJs({ wasmBinary });

    let db: Database;
    if (fs.existsSync(file)) {
      try {
        db = new SQL.Database(fs.readFileSync(file));
        db.exec('PRAGMA integrity_check');
        // Keep yesterday's copy around in case the next write is interrupted by a power cut.
        fs.copyFileSync(file, `${file}.bak`);
      } catch (err) {
        // Unreadable file: keep it for recovery, try the backup, else start empty.
        const aside = `${file}.corrupt-${Date.now()}`;
        fs.renameSync(file, aside);
        console.error(`[db] ${file} unreadable (${String(err)}); moved to ${aside}`);
        db = fs.existsSync(`${file}.bak`) ? new SQL.Database(fs.readFileSync(`${file}.bak`)) : new SQL.Database();
      }
    } else {
      db = new SQL.Database();
    }

    const store = new Store(db, file);
    store.migrate();
    return store;
  }

  private migrate(): void {
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);
    const version = Number(this.kvGet('schema_version') ?? 0);
    if (version < 1) {
      this.tx(() => {
        this.kvSet('shop_settings', JSON.stringify(DEFAULT_SETTINGS));
        this.kvSet('printer_config', JSON.stringify(DEFAULT_PRINTER_CONFIG));
        this.writeProducts(SAMPLE_PRODUCTS);
        this.kvSet('schema_version', '1');
      });
    }
    if (version < 2) {
      this.tx(() => {
        for (const table of ['estimate_items', 'products']) {
          const has = this.all(`PRAGMA table_info(${table})`).some((c) => c.name === 'pcs_unit');
          if (!has) this.run(`ALTER TABLE ${table} ADD COLUMN pcs_unit TEXT NOT NULL DEFAULT 'pc'`);
        }
        // Version 1 shipped placeholder products; replace them with the shop's sample list
        // only if the owner never edited them.
        const ids = this.all('SELECT id FROM products ORDER BY position').map((r) => String(r.id)).join(',');
        if (ids === SAMPLE_PRODUCTS.map((x) => x.id).join(',')) this.writeProducts(SAMPLE_PRODUCTS);
        this.kvSet('schema_version', String(SCHEMA_VERSION));
      });
    }
  }

  // ---------------------------------------------------------------- plumbing

  private all(sql: string, params: SqlValue[] = []): Row[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  private run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
  }

  /** Runs `fn` in a transaction and writes the database file once it commits. */
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      this.persist();
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private persist(): void {
    const data = this.db.export();
    // export() resets this connection's pragmas.
    this.db.exec('PRAGMA foreign_keys = ON');
    const tmp = `${this.file}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }

  private kvGet(key: string): string | null {
    const row = this.all('SELECT value FROM kv WHERE key = ?', [key])[0];
    return row ? String(row.value) : null;
  }

  private kvSet(key: string, value: string): void {
    this.run('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  get filePath(): string {
    return this.file;
  }

  // ---------------------------------------------------------------- settings

  getSettings(): ShopSettings {
    const raw = this.kvGet('shop_settings');
    return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<ShopSettings>) : {}) };
  }

  saveSettings(s: ShopSettings): ShopSettings {
    this.tx(() => this.kvSet('shop_settings', JSON.stringify(s)));
    return this.getSettings();
  }

  getPrinterConfig(): PrinterConfig {
    const raw = this.kvGet('printer_config');
    return { ...DEFAULT_PRINTER_CONFIG, ...(raw ? (JSON.parse(raw) as Partial<PrinterConfig>) : {}) };
  }

  savePrinterConfig(c: PrinterConfig): PrinterConfig {
    this.tx(() => this.kvSet('printer_config', JSON.stringify(c)));
    return this.getPrinterConfig();
  }

  // ---------------------------------------------------------------- draft (auto-save)

  getDraft(): Estimate | null {
    const raw = this.kvGet('draft');
    return raw ? (JSON.parse(raw) as Estimate) : null;
  }

  saveDraft(est: Estimate | null): void {
    this.tx(() => {
      if (est) this.kvSet('draft', JSON.stringify(est));
      else this.run("DELETE FROM kv WHERE key = 'draft'");
    });
  }

  // ---------------------------------------------------------------- products

  listProducts(): Product[] {
    return this.all('SELECT * FROM products ORDER BY position').map((r) => ({
      id: String(r.id),
      name: String(r.name),
      metal: r.metal === 'gold' ? 'gold' : 'silver',
      tunch: Number(r.tunch),
      wastage: Number(r.wastage),
      labourRate: Number(r.labour_rate),
      labourMode: r.labour_mode as Product['labourMode'],
      pcsUnit: r.pcs_unit === 'pair' ? 'pair' : 'pc',
    }));
  }

  private writeProducts(list: Product[]): void {
    this.run('DELETE FROM products');
    list.forEach((p, i) =>
      this.run(
        'INSERT INTO products(id, position, name, metal, tunch, wastage, labour_rate, labour_mode, pcs_unit) VALUES(?,?,?,?,?,?,?,?,?)',
        [p.id, i, p.name, p.metal, p.tunch, p.wastage, p.labourRate, p.labourMode, p.pcsUnit ?? 'pc'],
      ),
    );
  }

  saveProducts(list: Product[]): Product[] {
    this.tx(() => this.writeProducts(list));
    return this.listProducts();
  }

  // ---------------------------------------------------------------- estimates

  listEstimates(): EstimateSummary[] {
    return this.all(
      `SELECT e.*, (SELECT COUNT(*) FROM estimate_items i WHERE i.estimate_id = e.id) AS item_count
       FROM estimates e ORDER BY e.number DESC`,
    ).map((r) => ({
      id: String(r.id),
      number: Number(r.number),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      customerName: String(r.customer_name),
      grandTotal: Number(r.grand_total),
      itemCount: Number(r.item_count),
      printStatus: r.print_status as EstimateSummary['printStatus'],
      printedAt: r.printed_at == null ? null : String(r.printed_at),
    }));
  }

  getEstimate(id: string): Estimate | null {
    const r = this.all('SELECT * FROM estimates WHERE id = ?', [id])[0];
    if (!r) return null;
    const items: EstimateItem[] = this.all('SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY position', [id]).map((i) => ({
      id: String(i.id),
      description: String(i.description),
      metal: i.metal === 'gold' ? 'gold' : 'silver',
      grossWt: Number(i.gross_wt),
      lessWt: Number(i.less_wt),
      tunch: Number(i.tunch),
      wastage: Number(i.wastage),
      pcs: Number(i.pcs),
      labourRate: Number(i.labour_rate),
      labourMode: i.labour_mode as EstimateItem['labourMode'],
      pcsUnit: i.pcs_unit === 'pair' ? 'pair' : 'pc',
      amountOverride: i.amount_override == null ? null : Number(i.amount_override),
    }));
    return {
      id: String(r.id),
      number: Number(r.number),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      customerName: String(r.customer_name),
      customerPhone: String(r.customer_phone),
      pricing: JSON.parse(String(r.pricing_json)),
      otherCharges: JSON.parse(String(r.other_charges_json)),
      items,
      printStatus: r.print_status as Estimate['printStatus'],
      printedAt: r.printed_at == null ? null : String(r.printed_at),
      lastPrintError: r.last_print_error == null ? null : String(r.last_print_error),
    };
  }

  /** Inserts or updates. A new estimate gets the next number. Returns the stored copy. */
  saveEstimate(input: Estimate): Estimate {
    return this.tx(() => {
      const existing = this.all('SELECT number, created_at FROM estimates WHERE id = ?', [input.id])[0];
      const now = new Date().toISOString();
      const number = existing
        ? Number(existing.number)
        : Number(this.all('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM estimates')[0].n);
      const total = calcEstimate(input).grandTotal;
      const params: SqlValue[] = [
        input.customerName.trim(),
        input.customerPhone.trim(),
        JSON.stringify(input.pricing),
        JSON.stringify(input.otherCharges),
        total,
        now,
      ];
      if (existing) {
        this.run(
          `UPDATE estimates SET customer_name=?, customer_phone=?, pricing_json=?, other_charges_json=?, grand_total=?, updated_at=? WHERE id=?`,
          [...params, input.id],
        );
      } else {
        this.run(
          `INSERT INTO estimates(customer_name, customer_phone, pricing_json, other_charges_json, grand_total, updated_at, id, number, created_at, print_status)
           VALUES(?,?,?,?,?,?,?,?,?, 'not_printed')`,
          [...params, input.id, number, now],
        );
      }
      this.run('DELETE FROM estimate_items WHERE estimate_id = ?', [input.id]);
      input.items.forEach((it, pos) =>
        this.run(
          `INSERT INTO estimate_items(id, estimate_id, position, description, metal, gross_wt, less_wt, tunch, wastage, pcs, pcs_unit, labour_rate, labour_mode, amount_override)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [it.id, input.id, pos, it.description.trim(), it.metal, it.grossWt, it.lessWt, it.tunch, it.wastage, it.pcs, it.pcsUnit ?? 'pc', it.labourRate, it.labourMode, it.amountOverride],
        ),
      );
      return this.getEstimate(input.id) as Estimate;
    });
  }

  deleteEstimate(id: string): void {
    this.tx(() => this.run('DELETE FROM estimates WHERE id = ?', [id]));
  }

  recordPrint(estimateId: string | null, printer: string, ok: boolean, message: string): void {
    this.tx(() => {
      const now = new Date().toISOString();
      this.run('INSERT INTO print_log(estimate_id, at, printer, ok, message) VALUES(?,?,?,?,?)', [estimateId, now, printer, ok ? 1 : 0, message]);
      if (estimateId) {
        if (ok) this.run(`UPDATE estimates SET print_status='printed', printed_at=?, last_print_error=NULL WHERE id=?`, [now, estimateId]);
        else
          this.run(
            `UPDATE estimates SET print_status = CASE WHEN print_status='printed' THEN 'printed' ELSE 'failed' END, last_print_error=? WHERE id=?`,
            [message, estimateId],
          );
      }
    });
  }

  close(): void {
    this.db.close();
  }
}
