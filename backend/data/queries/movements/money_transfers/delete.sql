DELETE FROM movements
WHERE movement_code = ?
  AND type IN ('Expense', 'Income');
