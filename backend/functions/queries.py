import os

def load_query(filename: str) -> str:
    """
    Reads a .sql file from the queries folder and returns it as a string.
    
    Why do we keep SQL in separate files instead of writing it inside Python strings?
    - .sql files get syntax highlighting in your editor
    - You can run them directly in the SQLite CLI to test them
    - Keeps Python files clean — Python handles logic, SQL handles data
    
    Example:
        load_query("bank_accounts.sql")
        → reads data/queries/bank_accounts.sql and returns its contents as a string
    """
    path = os.path.join("data", "queries", filename)
    with open(path, "r") as f:
        return f.read()