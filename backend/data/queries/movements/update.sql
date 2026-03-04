UPDATE movements
SET
    movement = ?,
    description = ?,
    account_id = ?,
    value = ?,
    type = ?,
    date = ?,
    category_id = ?,
    sub_category_id = ?,
    repetitive_movement_id = ?,
    movement_code = ?,
    invoice = ?
WHERE id = ?;
