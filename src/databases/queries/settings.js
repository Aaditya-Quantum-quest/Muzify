import { db } from "../db";

export const saveSetting = (key, value) => {
  db.runSync(
    `INSERT OR REPLACE INTO app_settings (key, value)
     VALUES (?, ?)`,
    [key, value]
  );
};

export const getSetting = (key) => {
  const result = db.getFirstSync(
    "SELECT value FROM app_settings WHERE key = ?",
    [key]
  );

  return result?.value ?? null;
};