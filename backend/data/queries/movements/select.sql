SELECT
    m.id,
    m.movement,
    m.description,
    m.value,
    m.type,
    m.date,
    m.movement_code,
    m.invoice,
    m.active,
    m.account_id,
    ba.account,
    ba.currency,
    ba.initial_balance,
    m.category_id,
    c.category,
    m.sub_category_id,
    sc.sub_category,
    m.repetitive_movement_id,
    rm.movement AS repetitive_movement,
    ba.initial_balance + SUM(
        CASE 
            WHEN m.type = 'Income' THEN m.value 
            ELSE -m.value 
        END
    ) OVER (
        PARTITION BY m.account_id 
        ORDER BY m.date, m.id 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS balance_at_date
FROM movements m
JOIN bank_accounts ba
    ON ba.id = m.account_id
LEFT JOIN categories c
    ON c.id = m.category_id
LEFT JOIN sub_categories sc
    ON sc.id = m.sub_category_id
   AND sc.category_id = m.category_id
LEFT JOIN repetitive_movements rm
    ON rm.id = m.repetitive_movement_id
ORDER BY
    m.active DESC,
    m.date DESC,
    m.id DESC
LIMIT 12;