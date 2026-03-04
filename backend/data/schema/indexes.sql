CREATE INDEX IF NOT EXISTS idx_sub_categories_category_id       ON sub_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_movements_account_id             ON movements (account_id);
CREATE INDEX IF NOT EXISTS idx_movements_category_id            ON movements (category_id);
CREATE INDEX IF NOT EXISTS idx_movements_sub_category_id        ON movements (sub_category_id);
CREATE INDEX IF NOT EXISTS idx_movements_repetitive_movement_id ON movements (repetitive_movement_id);
CREATE INDEX IF NOT EXISTS idx_movements_type                   ON movements (type);
CREATE INDEX IF NOT EXISTS idx_movements_date                   ON movements (date);