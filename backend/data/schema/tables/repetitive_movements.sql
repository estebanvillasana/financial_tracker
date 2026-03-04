CREATE TABLE IF NOT EXISTS repetitive_movements (
	id                  INTEGER PRIMARY KEY AUTOINCREMENT,
	movement            TEXT    NOT NULL,
	description         TEXT,
	type                TEXT    NOT NULL CHECK (type IN ('Income', 'Expense')),
	tax_report          INTEGER NOT NULL DEFAULT 0 CHECK (tax_report IN (0, 1)),
	active_subscription INTEGER DEFAULT NULL
		CHECK (type != 'Income' OR active_subscription IS NULL)
		CHECK (active_subscription IN (0, 1, NULL)),
	active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);