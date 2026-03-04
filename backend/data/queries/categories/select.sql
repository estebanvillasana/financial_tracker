SELECT
    c.id,
    c.category,
    c.type,
    c.active,
    COALESCE(COUNT(DISTINCT m.id), 0) AS movements_count,
    COALESCE(COUNT(DISTINCT sc.id), 0) AS subcategories_count
FROM categories c
LEFT JOIN movements m
    ON m.category_id = c.id
   AND m.active = 1
LEFT JOIN sub_categories sc
    ON sc.category_id = c.id
GROUP BY
    c.id, c.category, c.type, c.active
ORDER BY
    c.active DESC,
    c.type,
    c.category;