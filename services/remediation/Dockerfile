FROM python:3.12-slim

WORKDIR /app

# Copy pre-downloaded wheels and install offline
COPY wheels/ /tmp/wheels/
RUN pip install --no-cache-dir --no-index --find-links=/tmp/wheels/ /tmp/wheels/*.whl && \
    rm -rf /tmp/wheels

COPY app/ app/

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/shared/python
ENV PORT=8085

EXPOSE 8085

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8085"]
