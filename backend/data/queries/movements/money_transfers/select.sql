SELECT
    m_expense.movement_code,
    m_expense.description,
    m_expense.date,
    ba_from.id as send_account_id,
    ba_from.account as send_account_name,
    ba_from.currency as send_currency,
    m_expense.value as sent_value,
    ba_to.id as receive_account_id,
    ba_to.account as receive_account_name,
    ba_to.currency as receive_currency,
    m_income.value as received_value
FROM movements m_expense
JOIN movements m_income ON m_income.movement_code = m_expense.movement_code
JOIN bank_accounts ba_from ON ba_from.id = m_expense.account_id
JOIN bank_accounts ba_to ON ba_to.id = m_income.account_id
WHERE m_expense.movement_code LIKE 'MT%'
    AND m_expense.type = 'Expense'
    AND m_income.type = 'Income'
ORDER BY m_expense.date DESC;
