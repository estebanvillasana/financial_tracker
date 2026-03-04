-- Bank accounts with current balance
-- Values are returned in cents (smallest currency unit)
-- Conversion to major units is handled by the frontend
SELECT
    ba.id,
    ba.account,
    ba.description,
    ba.type,
    ba.currency,
    ba.owner,
    ba.active,
    ba.initial_balance,
    COALESCE(SUM(
        CASE
            WHEN m.type = 'Expense' THEN -m.value
            WHEN m.type = 'Income'  THEN  m.value
            ELSE 0
        END
    ), 0) AS net_movements,
    ba.initial_balance + COALESCE(SUM(
        CASE
            WHEN m.type = 'Expense' THEN -m.value
            WHEN m.type = 'Income'  THEN  m.value
            ELSE 0
        END
    ), 0) AS total_balance
FROM bank_accounts ba
LEFT JOIN movements m
    ON m.account_id = ba.id
   AND m.active = 1
GROUP BY
    ba.id, ba.account, ba.description, ba.type,
    ba.currency, ba.owner, ba.active, ba.initial_balance
ORDER BY
    ba.active DESC,
    ba.owner,
    ba.currency,
    ba.account;