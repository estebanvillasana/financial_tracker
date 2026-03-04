CREATE TABLE IF NOT EXISTS bank_accounts (
	id               INTEGER PRIMARY KEY AUTOINCREMENT,
	account          TEXT    NOT NULL,
	description      TEXT,
	type             TEXT    NOT NULL CHECK (type IN ('Bank Account', 'Credit Card', 'Savings', 'Crypto Wallet', 'Money Bag')),
	owner            TEXT    NOT NULL,
	currency         TEXT    NOT NULL CHECK (length(currency) = 3),
	initial_balance  INTEGER NOT NULL,
	updated          INTEGER NOT NULL DEFAULT 0 CHECK (updated IN (0, 1)),
	active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);