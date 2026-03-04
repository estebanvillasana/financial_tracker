-- When a category is soft deleted, cascade to its sub_categories
CREATE TRIGGER IF NOT EXISTS deactivate_sub_categories
AFTER UPDATE OF active ON categories
WHEN NEW.active = 0
BEGIN
    UPDATE sub_categories SET active = 0 WHERE category_id = OLD.id;
END;

-- Internal transfer guardrails
-- Convention: MT_{sender_account_id}-{receiver_account_id}_{yymmdd}_{sequence}
CREATE TRIGGER IF NOT EXISTS validate_internal_transfer_insert
BEFORE INSERT ON movements
WHEN NEW.movement_code IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NEW.category_id IS NOT NULL
          OR NEW.sub_category_id IS NOT NULL
          OR NEW.repetitive_movement_id IS NOT NULL
        THEN RAISE(ABORT, 'Internal transfer cannot have category, sub category, or repetitive movement')
    END;

    SELECT CASE
        WHEN NEW.movement_code NOT GLOB 'MT_[0-9]*-[0-9]*_[0-9][0-9][0-9][0-9][0-9][0-9]_[0-9]*'
        THEN RAISE(ABORT, 'Invalid movement_code format. Expected MT_{from}-{to}_{yymmdd}_{n}')
    END;

    SELECT CASE
        WHEN NEW.movement_code NOT LIKE 'MT_%-%_' || REPLACE(SUBSTR(NEW.date, 3, 8), '-', '') || '_%'
        THEN RAISE(ABORT, 'movement_code date segment must match movement date (yymmdd)')
    END;

    SELECT CASE
        WHEN NEW.type = 'Expense'
         AND NEW.movement_code NOT LIKE 'MT_' || NEW.account_id || '-%_%_%'
        THEN RAISE(ABORT, 'For Expense transfer rows, sender account in movement_code must match account_id')
    END;

    SELECT CASE
        WHEN NEW.type = 'Income'
         AND NEW.movement_code NOT LIKE 'MT_%-' || NEW.account_id || '_%_%'
        THEN RAISE(ABORT, 'For Income transfer rows, receiver account in movement_code must match account_id')
    END;
END;

CREATE TRIGGER IF NOT EXISTS validate_internal_transfer_update
BEFORE UPDATE OF movement_code, account_id, type, date, category_id, sub_category_id, repetitive_movement_id
ON movements
WHEN NEW.movement_code IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NEW.category_id IS NOT NULL
          OR NEW.sub_category_id IS NOT NULL
          OR NEW.repetitive_movement_id IS NOT NULL
        THEN RAISE(ABORT, 'Internal transfer cannot have category, sub category, or repetitive movement')
    END;

    SELECT CASE
        WHEN NEW.movement_code NOT GLOB 'MT_[0-9]*-[0-9]*_[0-9][0-9][0-9][0-9][0-9][0-9]_[0-9]*'
        THEN RAISE(ABORT, 'Invalid movement_code format. Expected MT_{from}-{to}_{yymmdd}_{n}')
    END;

    SELECT CASE
        WHEN NEW.movement_code NOT LIKE 'MT_%-%_' || REPLACE(SUBSTR(NEW.date, 3, 8), '-', '') || '_%'
        THEN RAISE(ABORT, 'movement_code date segment must match movement date (yymmdd)')
    END;

    SELECT CASE
        WHEN NEW.type = 'Expense'
         AND NEW.movement_code NOT LIKE 'MT_' || NEW.account_id || '-%_%_%'
        THEN RAISE(ABORT, 'For Expense transfer rows, sender account in movement_code must match account_id')
    END;

    SELECT CASE
        WHEN NEW.type = 'Income'
         AND NEW.movement_code NOT LIKE 'MT_%-' || NEW.account_id || '_%_%'
        THEN RAISE(ABORT, 'For Income transfer rows, receiver account in movement_code must match account_id')
    END;
END;

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