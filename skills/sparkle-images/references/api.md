# Sparkle API Contract

The public API is documented at <https://sparkle.okthink.ai/docs/api-reference.html>, with a machine-readable schema at <https://us-central1-rm-image-maker.cloudfunctions.net/api/openapi.json>.

Base URL: `https://us-central1-rm-image-maker.cloudfunctions.net/api` (override with `SPARKLE_API_URL`).

Authentication uses `X-API-Key` with an `imk_…` key from Sparkle Settings, read from `SPARKLE_API_KEY`. API responses use `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "status" } }`.

Endpoints used by the CLI:

- `GET /v1/whoami`: verify the key.
- `GET /v1/models`: list model IDs and supported settings.
- `GET /v1/styles/catalog`, `GET /v1/styles/catalog/:styleId`: list or read built-in styles; authentication is not required.
- `GET /v1/billing/affordability?model=<id>&n=1`: preflight cost and balance.
- `POST /v1/images/generate`: submit `{ prompt, model, mode: "async", styleId, settings }`.
- `GET /v1/images/jobs`, `GET /v1/images/jobs/:jobId`: list jobs, or poll one until `completed` or `failed`; completed jobs expose `imageUrl`.
- `POST /v1/images/jobs/:jobId/retry`: retry a failed job.
- `GET /v1/video-models`, `POST /v1/video-models/quote`, `POST /v1/images/animate`: list video models, quote, and create a video from a completed image job.

Common OpenAI-backed settings are `size`, `quality_gpt`, `output_format`, and `n`. The CLI fixes `n` to one. Use the model catalog before relying on provider-specific settings.
