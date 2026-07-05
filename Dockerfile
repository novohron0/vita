FROM python:3.12-slim

# DejaVuSans — кириллица для серверного рендера обоев (см. app/render.py FONT_PATHS)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app app
COPY static static

EXPOSE 8787
# proxy-headers: за Caddy, чтобы ссылки в API были https и с правильным доменом
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
