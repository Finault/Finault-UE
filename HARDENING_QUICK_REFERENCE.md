# Enterprise Hardening - Quick Reference

## What Was Added?

### 1. API Documentation (OpenAPI)
- **Endpoint:** `GET /api/v1/openapi.json` (no auth needed)
- **Use:** Automated API documentation, client SDK generation
- **Returns:** OpenAPI 3.1 specification JSON

### 2. Swagger UI
- **Endpoint:** `GET /api/v1/docs` (no auth needed)
- **Use:** Interactive API documentation interface
- **Browser:** Visit `https://api.finault.com/api/v1/docs`

### 3. Pagination
- **Query Params:** `?limit=20&offset=0`
- **Max Limit:** 100 items per page
- **Response:** Includes `pagination { total, limit, offset, hasMore }`

### 4. Response Caching
- **Headers:**
  - `ETag: "W/<hash>"` - Cache validator
  - `Cache-Control: private, max-age=60` - 60-second cache
  - `Vary: Authorization, Accept` - Cache key modifiers
- **Browser:** Automatically caches GET responses
- **Server:** Returns `304 Not Modified` if client has fresh copy

### 5. Webhook Security
- **Header Required:** `X-Webhook-Signature: <sha256-hex>`
- **Signature:** HMAC-SHA256(body, process.env.WEBHOOK_SECRET)
- **Python Example:**
  ```python
  import hmac
  import hashlib

  secret = os.getenv('WEBHOOK_SECRET')
  signature = hmac.new(
    secret.encode(),
    body.encode(),
    hashlib.sha256
  ).hexdigest()

  headers = {'X-Webhook-Signature': signature}
  ```

### 6. Server Graceful Shutdown
- **Signals:** SIGTERM, SIGINT
- **Behavior:**
  1. Stops accepting new requests (returns 503)
  2. Waits up to 30 seconds for in-flight requests
  3. Closes connections gracefully
  4. Exits with code 0

### 7. Request Size Limits
- **Max Body:** 1MB (1,000,000 bytes)
- **Error Code:** `FINAULT-4001`
- **HTTP Status:** `413 Payload Too Large`

---

## Configuration

```bash
export JWT_SECRET="your-jwt-secret-key"      # For auth
export WEBHOOK_SECRET="your-webhook-secret"   # For webhooks
```

---

## Testing Webhooks

```bash
# 1. Generate signature
SECRET="webhook_secret_123"
BODY='{"event":"invoice.created","id":"123"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

# 2. Send webhook
curl -X POST https://api.finault.com/webhooks/invoice \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -d "$BODY"

# Expected: 202 Accepted with jobId
```

---

## Monitoring

### Health Checks
- `GET /health` - Returns `{ status: 'healthy' }`
- `GET /` - Returns full server status with agent list

### Metrics
- `GET /api/v1/metrics` (requires auth) - Agent performance metrics
- `GET /api/v1/cache/stats` (requires auth) - Cache hit rates
- `GET /api/v1/jobs/health` (requires auth) - Job queue status

### Observability
- All responses include `requestId` for tracing
- Graceful shutdown waits for all in-flight requests
- Dead letter queue for failed webhook jobs

---

## API Standards

### All Responses Include:
```json
{
  "success": true,
  "data": { ... },
  "requestId": "req_...",
  "timestamp": "2026-02-11T..."
}
```

### Error Responses Include:
```json
{
  "success": false,
  "error": {
    "code": "FINAULT-XXXX",
    "message": "Description",
    "retryable": true
  },
  "requestId": "req_...",
  "timestamp": "2026-02-11T..."
}
```

### List Responses Include:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 1000,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  },
  "requestId": "req_...",
  "timestamp": "2026-02-11T..."
}
```

---

## Key Endpoints by Category

### Chat & Conversation
- `POST /api/v1/chat` - Send message to Finault Pal
- `GET /api/v1/sessions` - Get user sessions

### Intelligence
- `POST /api/v1/intelligence/anomalies` - Detect anomalies
- `POST /api/v1/intelligence/patterns` - Learn patterns
- `POST /api/v1/intelligence/drivers` - Analyze cost drivers

### Optimization
- `GET /api/v1/optimizations` - Get recommendations
- `POST /api/v1/optimizations/:id/apply` - Apply optimization

### Forecasting
- `GET /api/v1/forecast` - Get cost forecast
- `POST /api/v1/forecast/budget-analysis` - Analyze budget vs forecast

### Compliance & Policy
- `GET /api/v1/policies/compliance` - Check compliance status
- `GET /api/v1/policies/violations` - Get violations
- `POST /api/v1/policies` - Create new policy

### Administration
- `GET /api/v1/openapi.json` - API specification
- `GET /api/v1/docs` - Interactive API docs
- `GET /api/v1/infrastructure` - System status
- `GET /api/v1/errors` - Error taxonomy

---

## Performance Tips

1. **Use Pagination:**
   - Always use `?limit=20` for list endpoints
   - Iterate through pages using `offset`

2. **Leverage Caching:**
   - Browser caches GET responses for 60 seconds
   - Reduces API load by 30-50% in typical usage

3. **Request Size:**
   - Keep request bodies under 1MB
   - Use pagination for large data imports

4. **Webhook Queuing:**
   - Webhooks are processed asynchronously
   - Check job status with `GET /api/v1/jobs/:jobId`
   - Returned job ID indicates successful queue

---

## Troubleshooting

### 503 Service Unavailable
- Server is shutting down
- Wait for deployment to complete
- Retry with exponential backoff

### 401 Unauthorized (Webhooks)
- `X-Webhook-Signature` header missing or invalid
- Verify `WEBHOOK_SECRET` matches sender's secret
- Check signature was computed over raw body

### 413 Payload Too Large
- Request body exceeds 1MB
- Split large uploads into multiple requests
- Use pagination for data imports

### 304 Not Modified
- Expected behavior for cached GET requests
- Client has fresh data
- No additional API quota consumed

---

## Production Checklist

- [ ] Set `JWT_SECRET` environment variable
- [ ] Set `WEBHOOK_SECRET` for webhook endpoints
- [ ] Enable webhook signature verification (already enabled)
- [ ] Monitor graceful shutdown during deployments
- [ ] Test pagination on all list endpoints
- [ ] Verify ETag caching with curl `-H "If-None-Match"`
- [ ] Test webhook delivery with sample payloads
- [ ] Monitor `requestId` in logs for request tracing
- [ ] Set up alerting on 503 status codes
- [ ] Review OpenAPI spec at `/api/v1/docs`
