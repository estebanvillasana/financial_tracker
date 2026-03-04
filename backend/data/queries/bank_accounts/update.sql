UPDATE bank_accounts
SET
    account = ?,
    description = ?,
    type = ?,
    owner = ?,
    currency = ?,
    initial_balance = ?,
    updated = ?
WHERE id = ?;