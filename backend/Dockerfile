FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Data dirs are created on the host and mounted as volumes.
# These just ensure they exist inside the image as a fallback.
RUN mkdir -p data/database data/backups data/usd_exchange_rates

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
