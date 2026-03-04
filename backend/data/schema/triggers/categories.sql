-- When a category is soft deleted, cascade to its sub_categories
CREATE TRIGGER IF NOT EXISTS deactivate_sub_categories
AFTER UPDATE OF active ON categories
WHEN NEW.active = 0
BEGIN
    UPDATE sub_categories SET active = 0 WHERE category_id = OLD.id;
END;
