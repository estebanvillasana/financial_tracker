UPDATE movements
SET
    movement = ?,
    description = ?,
    account_id = ?,
    value = ?,
    date = ?,
    movement_code = ?
WHERE id = ?;
