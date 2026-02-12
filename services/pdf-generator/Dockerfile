# ═══════════════════════════════════════════════════════════════════════════════
# FINAULT PDF GENERATOR SERVICE
# ═══════════════════════════════════════════════════════════════════════════════
# Diamond Tier - CFO/Auditor-Ready Document Generation
#
# Compliance: SOX 404, GAAP, PCAOB AS 1215, ISAE 3402
# ═══════════════════════════════════════════════════════════════════════════════

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for reportlab
RUN apt-get update && apt-get install -y \
    libfreetype6-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY generator.py .
COPY app.py .

# Create non-root user for security
RUN useradd -m -u 1000 finault && chown -R finault:finault /app
USER finault

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

# Run with gunicorn for production
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "app:app"]
