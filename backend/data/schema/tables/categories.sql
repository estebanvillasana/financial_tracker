CREATE TABLE IF NOT EXISTS categories (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	category TEXT    NOT NULL,
	type     TEXT    NOT NULL CHECK (type IN ('Income', 'Expense')),
	active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);