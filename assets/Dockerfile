# Use Python 3.11
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy your repo
COPY . /app

# Install dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Expose port
EXPOSE 10000

# Run the app
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000"]