-- Monthly cashflow summary (income, expense, net)

SELECT
    strftime('%Y-%m', m.date) AS month,
    ROUND(SUM(CASE WHEN m.type = 'Income'  THEN m.value ELSE 0 END) / 100.0, 2) AS income,
    ROUND(SUM(CASE WHEN m.type = 'Expense' THEN m.value ELSE 0 END) / 100.0, 2) AS expense,
    ROUND(SUM(CASE WHEN m.type = 'Income'  THEN m.value ELSE -m.value END) / 100.0, 2) AS net
FROM movements m
GROUP BY strftime('%Y-%m', m.date)
ORDER BY month DESC;
