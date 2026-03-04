-- Movement category must match movement type (Income/Expense)
CREATE TRIGGER IF NOT EXISTS validate_movement_category_type_insert
BEFORE INSERT ON movements
WHEN NEW.category_id IS NOT NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM categories c
            WHERE c.id = NEW.category_id
              AND c.type <> NEW.type
        )
        THEN RAISE(ABORT, 'Movement type must match category type')
    END;
END;

CREATE TRIGGER IF NOT EXISTS validate_movement_category_type_update
BEFORE UPDATE OF type, category_id ON movements
WHEN NEW.category_id IS NOT NULL
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM categories c
            WHERE c.id = NEW.category_id
              AND c.type <> NEW.type
        )
        THEN RAISE(ABORT, 'Movement type must match category type')
    END;
END;
