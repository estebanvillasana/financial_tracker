-- Last 50 movements with signed value and context

SELECT
    m.id,
    m.date,
    m.movement,
    m.description,
    ba.account,
    ba.currency,
    m.type,
    ROUND((CASE WHEN m.type = 'Expense' THEN -m.value ELSE m.value END) / 100.0, 2) AS signed_value,
    c.category,
    sc.sub_category,
    m.money_transfer,
    m.movement_code,
    m.invoice
FROM movements m
JOIN bank_accounts ba
    ON ba.id = m.account_id
LEFT JOIN categories c
    ON c.id = m.category_id
LEFT JOIN sub_categories sc
    ON sc.id = m.sub_category_id
ORDER BY m.date DESC, m.id DESC
LIMIT 50;
