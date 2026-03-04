-- Overview of all accounts with current total balance
-- active first; values converted from cents to major currency units

SELECT
    ba.id,
    ba.account,
    ba.type,
    ba.currency,
    ba.owner,
    ba.active,
    ROUND(ba.initial_balance / 100.0, 2) AS initial_balance,
    ROUND(COALESCE(SUM(
        CASE
            WHEN m.type = 'Expense' THEN -m.value
            WHEN m.type = 'Income'  THEN  m.value
            ELSE 0
        END
    ), 0) / 100.0, 2) AS net_movements,
    ROUND((
        ba.initial_balance + COALESCE(SUM(
            CASE
                WHEN m.type = 'Expense' THEN -m.value
                WHEN m.type = 'Income'  THEN  m.value
                ELSE 0
            END
        ), 0)
    ) / 100.0, 2) AS total_balance
FROM bank_accounts ba
LEFT JOIN movements m
    ON m.account_id = ba.id
GROUP BY
    ba.id, ba.account, ba.type, ba.currency, ba.owner, ba.active, ba.initial_balance
ORDER BY
    ba.active DESC,
    ba.owner,
    ba.currency,
    ba.account;
