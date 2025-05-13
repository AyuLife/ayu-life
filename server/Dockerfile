# Use a lightweight Python base image
FROM --platform=linux/amd64 python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port and start the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
