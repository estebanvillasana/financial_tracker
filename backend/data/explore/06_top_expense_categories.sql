-- Top expense categories by total spent

SELECT
    c.category,
    ROUND(SUM(m.value) / 100.0, 2) AS total_spent,
    COUNT(*) AS movement_count
FROM movements m
LEFT JOIN categories c
    ON c.id = m.category_id
WHERE m.type = 'Expense'
GROUP BY c.category
ORDER BY total_spent DESC;
