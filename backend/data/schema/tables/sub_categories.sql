CREATE TABLE IF NOT EXISTS sub_categories (
	id           INTEGER PRIMARY KEY AUTOINCREMENT,
	sub_category TEXT    NOT NULL,
	category_id  INTEGER NOT NULL,
	active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	FOREIGN KEY (category_id) REFERENCES categories (id) ON UPDATE CASCADE ON DELETE RESTRICT,
	UNIQUE (id, category_id)
);