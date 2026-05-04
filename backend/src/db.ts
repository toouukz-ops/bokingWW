import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      capacity_adults INTEGER NOT NULL DEFAULT 2,
      capacity_children INTEGER NOT NULL DEFAULT 0,
      base_price INTEGER NOT NULL DEFAULT 0,
      photo_path TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      price INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      first_name TEXT,
      last_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_number TEXT NOT NULL,
      client_id INTEGER,
      check_in TEXT NOT NULL,
      check_out TEXT,
      adults INTEGER NOT NULL DEFAULT 1,
      children INTEGER NOT NULL DEFAULT 0,
      total_price INTEGER NOT NULL DEFAULT 0,
      prepayment INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      chat_title TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn("rooms", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("rooms", "floor", "TEXT");
  ensureColumn("rooms", "extra_beds", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("rooms", "beds", "TEXT");
  ensureColumn("rooms", "description", "TEXT");
  ensureColumn("rooms", "amenities", "TEXT");
  ensureColumn("rooms", "admin_notes", "TEXT");
  ensureColumn("rooms", "photo_paths", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("rooms", "video_paths", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn("rooms", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

  seedRooms();
}

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedRooms() {
  const roomNumbers = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "115"];
  const insertRoom = db.prepare(`
    INSERT OR IGNORE INTO rooms (number, title, capacity_adults, capacity_children, base_price, status)
    VALUES (@number, @title, 2, 0, 0, 'active')
  `);

  const transaction = db.transaction(() => {
    for (const number of roomNumbers) {
      insertRoom.run({
        number,
        title: `Номер ${number}`
      });
    }
  });

  transaction();
}
