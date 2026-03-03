PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

DELETE FROM movements;
DELETE FROM repetitive_movements;
DELETE FROM sub_categories;
DELETE FROM categories;
DELETE FROM bank_accounts;

INSERT INTO bank_accounts (id, account, description, type, owner, currency, initial_balance, active, updated)
VALUES
    (1, 'BBVA', 'Card: 4152313657495730 CLABE: 012580004734123181', 'Bank Account', 'Esteban Villasana', 'mxn', 18366, 1, 0),
    (2, 'Hey Crédito', 'card: 4741751704942253', 'Credit Card', 'Esteban Villasana', 'mxn', -1575321, 1, 0),
    (3, 'Wise - USD', NULL, 'Bank Account', 'Esteban Villasana', 'usd', 0, 1, 0),
    (4, 'Binance - USDT', NULL, 'Crypto Wallet', 'Esteban Villasana', 'usd', 0, 1, 0),
    (5, 'Sberbank Nadya', NULL, 'Bank Account', 'Nadya Zubova', 'rub', 0, 1, 0),
    (6, 'Sberbank Credit Nadya', NULL, 'Credit Card', 'Nadya Zubova', 'rub', 0, 1, 0),
    (7, 'Wise Cash Personal Savings', NULL, 'Savings', 'Esteban Villasana', 'usd', 0, 1, 0),
    (8, 'Hey - Fondo Emergencias', '4% return', 'Savings', 'Esteban Villasana', 'mxn', 0, 1, 0),
    (9, 'TinkOff Platinum Nadya', NULL, 'Credit Card', 'Nadya Zubova', 'rub', 0, 1, 1),
    (10, 'TinkOff Black Nadya', NULL, 'Bank Account', 'Nadya Zubova', 'rub', 0, 1, 1),
    (11, 'ByBit - USDT', NULL, 'Crypto Wallet', 'Esteban Villasana', 'usd', 0, 0, 1),
    (12, 'Hey', NULL, 'Bank Account', 'Esteban Villasana', 'mxn', 1109237, 0, 1),
    (13, 'TinkOff Esteban', NULL, 'Bank Account', 'Esteban Villasana', 'rub', 0, 0, 1),
    (14, 'Binance Cash Savings - USDT', 'admin@estebanvillasana.com', 'Savings', 'Esteban Villasana', 'usd', 0, 0, 1),
    (15, 'TinkOff Savings', NULL, 'Savings', 'Esteban Villasana', 'rub', 0, 0, 1),
    (16, 'Amex', NULL, 'Credit Card', 'Esteban Villasana', 'mxn', -799280, 0, 1),
    (17, 'BOG - Main', NULL, 'Bank Account', 'Esteban Villasana', 'gel', 22335, 0, 1),
    (18, 'BOG Business - ENVC', NULL, 'Bank Account', 'Esteban Villasana', 'gel', -3114, 0, 1),
    (19, 'BOG Business - eCom EU EUR', NULL, 'Bank Account', 'Esteban Villasana', 'eur', 0, 0, 1),
    (20, 'BOG Business - ENVC USD', NULL, 'Bank Account', 'Esteban Villasana', 'usd', 0, 0, 1),
    (21, 'BBVA - Clientes', NULL, 'Money Bag', 'Esteban Villasana', 'mxn', 0, 0, 1),
    (22, 'Bitso ENVC', NULL, 'Bank Account', 'Esteban Villasana', 'usd', 0, 0, 1),
    (23, 'BOG - Savings', NULL, 'Savings', 'Esteban Villasana', 'gel', 0, 0, 1),
    (24, 'BBVA Cash Savings', NULL, 'Savings', 'Esteban Villasana', 'mxn', 0, 0, 1),
    (25, 'Sberbank Esteban', NULL, 'Bank Account', 'Esteban Villasana', 'rub', 0, 0, 1),
    (26, 'Wise - Clients Mkt', NULL, 'Money Bag', 'Esteban Villasana', 'usd', 0, 0, 1),
    (27, 'Antartic Wallet', NULL, 'Crypto Wallet', 'Esteban Villasana', 'usd', 0, 0, 1),
    (28, 'Telegram Wallet', NULL, 'Crypto Wallet', 'Esteban Villasana', 'usd', 22118, 0, 1),
    (29, 'Credit Europe Bank', NULL, 'Bank Account', 'Nadya Zubova', 'rub', 0, 0, 1);

INSERT INTO categories (id, category, type)
VALUES
    (1, 'Necessary Regular Expenses', 'Expense'),
    (2, 'Other Regular Expenses', 'Expense'),
    (3, 'Not Regular Necessities', 'Expense'),
    (4, 'Dispensables', 'Expense'),
    (5, 'Investments', 'Expense'),
    (6, 'Taxes', 'Expense'),
    (7, 'Loans', 'Expense'),
    (8, 'Business Expenses', 'Expense'),
    (9, 'Paying Debts', 'Expense'),
    (10, 'Other Expense', 'Expense'),
    (11, 'Regular Salary', 'Income'),
    (12, 'Clients Regular Retainer', 'Income'),
    (13, 'Therapy Clients', 'Income'),
    (14, 'Business Cashouts', 'Income'),
    (15, 'Freelance Work', 'Income'),
    (16, 'Debt Collection', 'Income'),
    (17, 'Loan', 'Income'),
    (18, 'Assets Selling', 'Income'),
    (19, 'Cashbacks', 'Income'),
    (20, 'Selling Belongings', 'Income'),
    (21, 'Clients Subscriptions', 'Income'),
    (22, 'Other Income', 'Income'),
    (23, 'Return on investments', 'Income'),
    (24, 'Clients Marketing Budget', 'Income');

INSERT INTO sub_categories (id, sub_category, category_id)
VALUES
    (1, 'Rent Or Mortgage', 1),
    (2, 'Supermarket, Food & Pantry', 1),
    (3, 'Transport', 1),
    (4, 'Pocket Money', 1),
    (5, 'Living Services', 1),
    (6, 'Regular Medical Payments', 1),
    (7, 'Gym & Training', 1),
    (8, 'Self Care Services', 2),
    (9, 'Subscriptions', 2),
    (10, 'Holidays', 2),
    (11, 'Unregular Medical Payments', 3),
    (12, 'Emergencies', 3),
    (13, 'Moving', 3),
    (14, 'Various Articles', 3),
    (15, 'Big Purchases', 3),
    (16, 'Professional Services', 3),
    (17, 'Education', 3),
    (18, 'Videogames', 4),
    (19, 'Going Out', 4),
    (20, 'Vacations & Traveling', 4),
    (21, 'Dispensable Various Articles', 4),
    (22, 'Donation', 4),
    (23, 'Delivery Food', 4),
    (24, 'Real Estate', 5),
    (25, 'Stocks', 5),
    (26, 'Cryptos', 5),
    (27, 'Lend money to friends and family', 7),
    (28, 'Lend money to Fénix or Purewell', 7),
    (29, 'Lend money to clients', 7),
    (30, 'Software & Subscriptions', 8),
    (31, 'Clients Marketing', 8),
    (32, 'Professional Fees', 8),
    (33, 'Freelance Services', 8),
    (34, 'Business Articles', 8),
    (35, 'Interests', 9),
    (36, 'Business Opportunities or Own Business', 5),
    (37, 'Family loan', 17);

COMMIT;
