-- Internal transfer guardrails
-- Convention: MT_{sender_account_id:02d}-{receiver_account_id:02d}_{yymmdd}_{sequence}
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
        WHEN NEW.movement_code NOT GLOB 'MT_[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]_[0-9]*'
        THEN RAISE(ABORT, 'Invalid movement_code format. Expected MT_{from:02d}-{to:02d}_{yymmdd}_{n}')
    END;

    SELECT CASE
        WHEN NEW.movement_code NOT LIKE 'MT_%-%_' || REPLACE(SUBSTR(NEW.date, 3, 8), '-', '') || '_%'
        THEN RAISE(ABORT, 'movement_code date segment must match movement date (yymmdd)')
    END;

    SELECT CASE
        WHEN NEW.type = 'Expense'
         AND NEW.movement_code NOT LIKE 'MT_' || PRINTF('%02d', NEW.account_id) || '-%_%_%'
        THEN RAISE(ABORT, 'For Expense transfer rows, sender account in movement_code must match account_id')
    END;

    SELECT CASE
        WHEN NEW.type = 'Income'
         AND NEW.movement_code NOT LIKE 'MT_%-' || PRINTF('%02d', NEW.account_id) || '_%_%'
        THEN RAISE(ABORT, 'For Income transfer rows, receiver account in movement_code must match account_id')
    END;

    SELECT CASE
        WHEN NEW.type = 'Expense'
         AND NEW.movement NOT LIKE 'SEND TO % (%)'
        THEN RAISE(ABORT, 'Expense transfer movement must follow SEND TO {account} ({currency})')
    END;

    SELECT CASE
        WHEN NEW.type = 'Income'
         AND NEW.movement NOT LIKE 'RECEIVE FROM % (%)'
        THEN RAISE(ABORT, 'Income transfer movement must follow RECEIVE FROM {account} ({currency})')
    END;

    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM movements m
            WHERE m.movement_code = NEW.movement_code
              AND m.type IN ('Expense', 'Income')
        ) >= 2
        THEN RAISE(ABORT, 'Internal transfer movement_code can have only 2 rows (Expense + Income)')
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
        WHEN NEW.movement_code NOT GLOB 'MT_[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]_[0-9]*'
        THEN RAISE(ABORT, 'Invalid movement_code format. Expected MT_{from:02d}-{to:02d}_{yymmdd}_{n}')
    END;

    SELECT CASE
        WHEN NEW.movement_code NOT LIKE 'MT_%-%_' || REPLACE(SUBSTR(NEW.date, 3, 8), '-', '') || '_%'
        THEN RAISE(ABORT, 'movement_code date segment must match movement date (yymmdd)')
    END;

    SELECT CASE
        WHEN NEW.type = 'Expense'
         AND NEW.movement_code NOT LIKE 'MT_' || PRINTF('%02d', NEW.account_id) || '-%_%_%'
        THEN RAISE(ABORT, 'For Expense transfer rows, sender account in movement_code must match account_id')
    END;

    SELECT CASE
        WHEN NEW.type = 'Income'
         AND NEW.movement_code NOT LIKE 'MT_%-' || PRINTF('%02d', NEW.account_id) || '_%_%'
        THEN RAISE(ABORT, 'For Income transfer rows, receiver account in movement_code must match account_id')
    END;

    SELECT CASE
        WHEN NEW.type = 'Expense'
         AND NEW.movement NOT LIKE 'SEND TO % (%)'
        THEN RAISE(ABORT, 'Expense transfer movement must follow SEND TO {account} ({currency})')
    END;

    SELECT CASE
        WHEN NEW.type = 'Income'
         AND NEW.movement NOT LIKE 'RECEIVE FROM % (%)'
        THEN RAISE(ABORT, 'Income transfer movement must follow RECEIVE FROM {account} ({currency})')
    END;

    SELECT CASE
        WHEN (
            SELECT COUNT(*)
            FROM movements m
            WHERE m.movement_code = NEW.movement_code
              AND m.type IN ('Expense', 'Income')
              AND m.id <> OLD.id
        ) >= 2
        THEN RAISE(ABORT, 'Internal transfer movement_code can have only 2 rows (Expense + Income)')
    END;
END;
