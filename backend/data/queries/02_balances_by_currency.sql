-- Portfolio balance grouped by currency

SELECT
    ba.currency,
    ROUND(SUM(
        ba.initial_balance + COALESCE(ms.net_movement_cents, 0)
    ) / 100.0, 2) AS total_balance
FROM bank_accounts ba
LEFT JOIN (
    SELECT
        account_id,
        SUM(CASE
            WHEN type = 'Expense' THEN -value
            WHEN type = 'Income'  THEN  value
            ELSE 0
        END) AS net_movement_cents
    FROM movements
    GROUP BY account_id
) ms
    ON ms.account_id = ba.id
GROUP BY ba.currency
ORDER BY ba.currency;
