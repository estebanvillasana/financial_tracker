
bank_accounts
- id
- account (text)
- description (text)
- type (text, but the options are:
  - Bank Account
  - Credit Card
  - Savings
  - Crypto Wallet
  - Money Bag)
- owner (text)
- currency (3 characters such as USD, MXN, EUR)
- initial_balance (INT, not Float, the last 2 digits will be the cents, so 18360 would mean $183.60, for example)
- active (bool, true by default)
- updated (bool, false by default)

categories
- id
- category (text)
- type (text: Income or Expense)

sub_categories
- id
- sub_category (text)
- category_id (FK to "categories")

movements
- id
- movement (text)
- description (text)
- account_id (FK to "bank_accounts")
- value (INT, the value is in cents)
- type (text: Income or Expense)
- category_id (FK to "categories")
- sub_category_id (FK to "sub_categories", also, only allowed sub categories that are related to the main category - optional)
- tax_report (bool, false by default)
- repetitive_movement_id (FK to "repetitive_movements" - optional)
- movement_code (text)

repetitive_movements
- id
- movement (text)
- description (text)
- type (text: Income or Expense)
- category (text)