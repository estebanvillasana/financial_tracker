CREATE TABLE IF NOT EXISTS movements (
	id                     INTEGER PRIMARY KEY AUTOINCREMENT,
	movement               TEXT    NOT NULL,
	description            TEXT,
	account_id             INTEGER NOT NULL,
	value                  INTEGER NOT NULL,
	type                   TEXT    NOT NULL CHECK (type IN ('Income', 'Expense')),
	date                   TEXT    NOT NULL,
	category_id            INTEGER,
	sub_category_id        INTEGER,
	repetitive_movement_id INTEGER,
	movement_code          TEXT,
	invoice                INTEGER NOT NULL DEFAULT 0 CHECK (invoice IN (0, 1)),
	active                 INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	FOREIGN KEY (account_id)                   REFERENCES bank_accounts (id)               ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (category_id)                  REFERENCES categories (id)                  ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (sub_category_id, category_id) REFERENCES sub_categories (id, category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (repetitive_movement_id)       REFERENCES repetitive_movements (id)        ON UPDATE CASCADE ON DELETE SET NULL
);