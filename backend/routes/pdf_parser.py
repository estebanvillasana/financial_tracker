"""
PDF table extraction endpoint.

Accepts a PDF file upload, extracts all tables using pdfplumber,
and returns structured JSON with all raw rows per table.
The frontend decides which row is the header.
"""

import io
from fastapi import APIRouter, UploadFile, File, HTTPException

router = APIRouter(prefix="/pdf", tags=["PDF"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/parse-tables")
async def parse_tables(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="pdfplumber is not installed on the server.",
        )

    tables = []

    try:
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            page_count = len(pdf.pages)

            for page_idx, page in enumerate(pdf.pages):
                page_tables = page.extract_tables()
                if not page_tables:
                    continue

                for table_idx, table in enumerate(page_tables):
                    if not table or len(table) < 2:
                        continue

                    # Normalize every cell; keep ALL rows (frontend picks the header)
                    col_count = max(len(row) for row in table)
                    raw_rows = []
                    for row in table:
                        cells = [
                            str(cell).strip() if cell else ""
                            for cell in row
                        ]
                        # Pad short rows to uniform column count
                        while len(cells) < col_count:
                            cells.append("")
                        raw_rows.append(cells)

                    # Drop trailing fully-empty rows
                    while raw_rows and not any(c for c in raw_rows[-1]):
                        raw_rows.pop()

                    if len(raw_rows) >= 2:
                        tables.append({
                            "page": page_idx + 1,
                            "table_index": table_idx,
                            "raw_rows": raw_rows,
                        })

    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse PDF: {str(e)}",
        )

    if not tables:
        raise HTTPException(
            status_code=422,
            detail="No tables found in the uploaded PDF.",
        )

    return {
        "filename": file.filename,
        "page_count": page_count,
        "tables": tables,
    }
