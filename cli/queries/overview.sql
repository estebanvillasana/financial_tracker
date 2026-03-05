-- Account balances overview
-- Active accounts first; values converted from cents to major currency units.
-- FX conversion to the main currency is done in Python after this query runs.

SELECT
    ba.id,
    ba.account,
    ba.type,
    ba.currency,
    ba.owner,
    ba.active,
    ROUND((
        ba.initial_balance + COALESCE(SUM(
            CASE
                WHEN m.active = 1 AND m.type = 'Expense' THEN -m.value
                WHEN m.active = 1 AND m.type = 'Income'  THEN  m.value
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
