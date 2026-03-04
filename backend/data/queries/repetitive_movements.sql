SELECT
    rm.id,
    rm.movement,
    rm.description,
    rm.type,
    rm.tax_report,
    rm.active_subscription,
    rm.active,
    COALESCE(COUNT(m.id), 0) AS movements_count
FROM repetitive_movements rm
LEFT JOIN movements m
    ON m.repetitive_movement_id = rm.id
   AND m.active = 1
GROUP BY
    rm.id, rm.movement, rm.description,
    rm.type, rm.tax_report, rm.active_subscription, rm.active
ORDER BY
    rm.active DESC,
    rm.type,
    rm.movement;