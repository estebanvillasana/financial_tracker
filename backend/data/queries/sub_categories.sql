SELECT
    sc.id,
    sc.sub_category,
    sc.category_id,
    c.category,
    c.type,
    sc.active,
    COALESCE(COUNT(m.id), 0) AS movements_count
FROM sub_categories sc
JOIN categories c
    ON c.id = sc.category_id
LEFT JOIN movements m
    ON m.sub_category_id = sc.id
   AND m.category_id = sc.category_id
   AND m.active = 1
GROUP BY
    sc.id, sc.sub_category, sc.category_id,
    c.category, c.type, sc.active
ORDER BY
    sc.active DESC,
    c.type,
    c.category,
    sc.sub_category;