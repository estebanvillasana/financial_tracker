INSERT INTO movements (
    movement,
    description,
    account_id,
    value,
    type,
    date,
    category_id,
    sub_category_id,
    repetitive_movement_id,
    movement_code,
    invoice,
    active
)
VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?);
