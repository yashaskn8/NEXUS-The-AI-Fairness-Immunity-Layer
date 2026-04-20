FROM python:3.12-slim

WORKDIR /app

COPY wheels/ /tmp/wheels/
RUN pip install --no-cache-dir --no-index --find-links=/tmp/wheels/ /tmp/wheels/*.whl && \
    rm -rf /tmp/wheels

COPY app/ app/

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/shared/python
ENV PORT=8084

EXPOSE 8084

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8084"]
