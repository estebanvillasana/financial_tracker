PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bank_accounts (
	id               INTEGER PRIMARY KEY AUTOINCREMENT,
	account          TEXT    NOT NULL,
	description      TEXT,
	type             TEXT    NOT NULL CHECK (type IN ('Bank Account', 'Credit Card', 'Savings', 'Crypto Wallet', 'Money Bag')),
	owner            TEXT    NOT NULL,
	currency         TEXT    NOT NULL CHECK (length(currency) = 3),
	initial_balance  INTEGER NOT NULL,
	active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	updated          INTEGER NOT NULL DEFAULT 0 CHECK (updated IN (0, 1))
);

CREATE TABLE IF NOT EXISTS categories (
	id        INTEGER PRIMARY KEY AUTOINCREMENT,
	category  TEXT NOT NULL,
	type      TEXT NOT NULL CHECK (type IN ('Income', 'Expense'))
);

CREATE TABLE IF NOT EXISTS sub_categories (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	sub_category TEXT    NOT NULL,
	category_id  INTEGER NOT NULL,
	FOREIGN KEY (category_id) REFERENCES categories (id) ON UPDATE CASCADE ON DELETE RESTRICT,
	UNIQUE (id, category_id)
);

CREATE TABLE IF NOT EXISTS repetitive_movements (
	id                  INTEGER PRIMARY KEY AUTOINCREMENT,
	movement            TEXT    NOT NULL,
	description         TEXT,
	type                TEXT    NOT NULL CHECK (type IN ('Income', 'Expense')),
	tax_report          INTEGER NOT NULL DEFAULT 0 CHECK (tax_report IN (0, 1)),
	active_subscription INTEGER DEFAULT NULL
		CHECK (type != 'Income' OR active_subscription IS NULL)
		CHECK (active_subscription IN (0, 1, NULL))
);

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
	FOREIGN KEY (account_id)             REFERENCES bank_accounts (id)        ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (category_id)            REFERENCES categories (id)            ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (sub_category_id, category_id) REFERENCES sub_categories (id, category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
	FOREIGN KEY (repetitive_movement_id) REFERENCES repetitive_movements (id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_categories_category_id      ON sub_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_movements_account_id            ON movements (account_id);
CREATE INDEX IF NOT EXISTS idx_movements_category_id           ON movements (category_id);
CREATE INDEX IF NOT EXISTS idx_movements_sub_category_id       ON movements (sub_category_id);
CREATE INDEX IF NOT EXISTS idx_movements_repetitive_movement_id ON movements (repetitive_movement_id);
CREATE INDEX IF NOT EXISTS idx_movements_type                  ON movements (type);
CREATE INDEX IF NOT EXISTS idx_movements_date                  ON movements (date);
