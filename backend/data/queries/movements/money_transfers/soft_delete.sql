UPDATE movements
SET active = 0
WHERE movement_code = ?
  AND type IN ('Expense', 'Income');
