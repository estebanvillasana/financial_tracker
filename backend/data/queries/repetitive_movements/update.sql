UPDATE repetitive_movements
SET
    movement = ?,
    description = ?,
    type = ?,
    tax_report = ?,
    active_subscription = ?
WHERE id = ?;
