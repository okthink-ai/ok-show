# Sparkle Asset Workflow

`ok-vibe-slides sparkle` is a client for the public [Sparkle API](https://sparkle.okthink.ai/docs/api-reference.html). It creates images and videos through Sparkle, downloads them into your project, and records each prompt, model, and job in a manifest you commit.

The workflow supports:

- Async image jobs with polling, retries, local download, and provenance.
- GPT Image, Nano Banana/Gemini, and FLUX/fal.ai model IDs returned by Sparkle.
- Saved or inline styles, inline characters, sticker mode, model settings, and reference-image URLs.
- Recent-job listing, individual status, retry, style lookup, model discovery, identity, and billing preflight.
- Server-authoritative video models, video quotes, explicit price acceptance, idempotent animation creation, MP4 download, and safe/paid video retry flows.

## Authentication

Create an API key in [Sparkle](https://sparkle.okthink.ai) under Settings, then put it in your project's `.env` file (git-ignored):

```bash
SPARKLE_API_KEY=imk_replace_with_your_key
```

Requests go to the public API base URL from the [API reference](https://sparkle.okthink.ai/docs/api-reference.html):

```text
https://us-central1-rm-image-maker.cloudfunctions.net/api
```

Set `SPARKLE_API_URL` only if you need to point at a different deployment.

Check authentication and available capabilities:

```bash
npm run sparkle -- whoami
npm run sparkle -- models
npm run sparkle -- styles --limit 100
npm run sparkle -- video-models
```

The key needs the scopes used by the command, including `images:generate`, `images:read`, `images:retry`, `styles:read`, and `images:animate` for video.

## Generate and Download an Image

```bash
npm run sparkle -- generate \
  "A clean editorial illustration of an evidence-driven engineering loop, no text" \
  --model gpt-image-2 \
  --size 1536x864 \
  --quality medium \
  --output src/data/presentations/demo/assets/generated/evidence-loop.png
```

For long prompts, use `--prompt-file`. For JSON options, pass inline JSON or prefix a file path with `@`:

```bash
npm run sparkle -- generate \
  --prompt-file docs/prompts/evidence-loop.txt \
  --style liquid-pond-cinematic \
  --output src/data/presentations/demo/assets/generated/evidence-loop.png

npm run sparkle -- generate "A caretaker character" \
  --style-json @docs/prompts/editorial-style.json \
  --character-json @docs/prompts/caretaker-character.json \
  --output src/data/presentations/demo/assets/generated/caretaker.png
```

Reference or edit existing hosted images by repeating `--input-image-url` in the intended order:

```bash
npm run sparkle -- generate "Combine these references into one presentation visual" \
  --input-image-url https://example.com/layout.png \
  --input-image-url https://example.com/character.png \
  --input-fidelity high \
  --output src/data/presentations/demo/assets/generated/combined.png
```

Additional settings include `--sticker`, `--background`, `--compression`, `--moderation`, `--image-size`, `--aspect-ratio`, and `--format`. Model support varies; use `models` as the server authority. Gemini and fal.ai image models currently return PNG.

The CLI refuses to replace a local file or manifest entry unless `--force` is supplied. Use `--dry-run` to inspect an image request without authentication, API calls, or writes.

## Inspect Jobs, Styles, and Billing

```bash
npm run sparkle -- status
npm run sparkle -- status --limit 25 --status completed
npm run sparkle -- status JOB_ID
npm run sparkle -- retry JOB_ID
npm run sparkle -- styles STYLE_ID
npm run sparkle -- affordability --model gpt-image-2 --count 1
```

Pagination cursors from `status` and `styles` can be passed back with `--cursor`.

## Quote and Generate Video

Sparkle video creation is paid, quoted, and idempotent. The source must be an owned, completed Sparkle image job; a local image path or arbitrary URL is not accepted.

First inspect the live catalog and request a quote:

```bash
npm run sparkle -- video-models

npm run sparkle -- video-quote \
  --source-job IMAGE_JOB_ID \
  --video-model kling-3-standard \
  --prompt "Locked camera; gentle ambient motion and a seamless loop" \
  --loop seamless \
  --duration 5 \
  --fps 12
```

After reviewing the returned `customerPriceCents`, run animation with that exact value and a stable idempotency key:

```bash
npm run sparkle -- animate \
  --source-job IMAGE_JOB_ID \
  --video-model kling-3-standard \
  --prompt "Locked camera; gentle ambient motion and a seamless loop" \
  --loop seamless \
  --duration 5 \
  --fps 12 \
  --accept-price 75 \
  --idempotency-key evidence-loop-v1 \
  --output src/data/presentations/demo/assets/generated/evidence-loop.mp4
```

The command re-quotes immediately before submission and refuses to spend if the exact price differs. Keep the same idempotency key and request if a response is interrupted; Sparkle will return the original job rather than create a second purchase.

Video retries also require a stable key. A recoverable retry resumes without another charge. A terminal provider failure returns a fresh paid-retry quote; passing `--accept-price` authorizes the retry only when the returned cents match exactly:

```bash
npm run sparkle -- retry VIDEO_JOB_ID \
  --idempotency-key evidence-loop-retry-1 \
  --accept-price 75
```

Video model durations, resolutions, loop modes, eligibility, and prices come from `video-models`; do not hardcode them into automation.

## Manifest and Validation

Successful downloads are recorded in the manifest of the deck that `--output` points into, for example:

```text
src/data/presentations/demo/assets/generated/sparkle-manifest.json
```

Pass `--manifest <path>` to write somewhere else, or when `--output` is outside `src/data/presentations/<id>/`.

Image entries keep the job ID, exact prompt, model, settings, style/character metadata, and billing summary. Animation entries keep the source and animation job IDs, normalized video request, accepted quote, and idempotency key.

Validate all recorded files before committing:

```bash
npm run sparkle -- validate
```

Without `--manifest`, `validate` checks every deck manifest under `src/data/presentations/`; pass `--manifest <path>` to check one file.
