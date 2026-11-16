---
name: sparkle-images
description: Generate styled raster images through the public Sparkle API (sparkle.okthink.ai) and save them as project assets with prompt and style metadata. Use when creating or replacing website illustrations, document images, marketing artwork, or other repository-bound images with Sparkle, especially when the user asks for the Sparkle API, Sparkle styles, or repeatable prompt provenance.
---

# Sparkle Images

Use the public Sparkle API through the project's CLI. Do not substitute OpenAI, Gemini, fal, or another provider API directly: Sparkle owns model routing, billing, saved styles, and job history. Run it as `npx ok-show sparkle ...` (`npm run sparkle -- ...` inside the ok-show repo); do not invoke a skill-local wrapper.

## Workflow

1. Confirm that `SPARKLE_API_KEY` is set, either exported or in the project's `.env`. Never print, log, persist, or place the key in a command argument. Do not treat provider keys such as `OPENAI_API_KEY` as Sparkle credentials.
2. Inspect available styles before choosing one:

   ```bash
   npm run sparkle -- styles
   ```

3. When model choice matters, inspect authenticated models:

   ```bash
   npm run sparkle -- models
   ```

4. Write a concrete prompt that describes the subject, composition, interactions, setting, intended medium, and exclusions. Keep literal text out of the image unless requested.
5. Generate one project asset at a time. Use a repository-relative output path and a catalog style ID:

   ```bash
   npm run sparkle -- generate "A candid editorial photograph of ..." \
     --style <style-id> \
     --model gpt-image-2 \
     --size 1536x864 \
     --quality medium \
     --format webp \
     --output public/images/example.webp
   ```

6. Inspect the saved image before using it. Iterate with one targeted prompt change if the composition or required details are wrong.
7. Keep the canonical Sparkle manifest entry. The CLI records the prompt, style, model, job ID, and generation settings without credentials in the shared manifest. When presenting the image in UI, show the same prompt and human-readable style so provenance is visible.
8. Update the consuming source, run the proportional build/test checks, and report the saved asset and prompt.

## Safety and Failure Handling

- Generation spends Sparkle credits. Run one requested final at a time unless the user asks for variants.
- The CLI runs affordability preflight before queuing a job. If Sparkle reports insufficient funds, stop; do not retry.
- If polling times out, preserve the printed job ID and check it with `status <job-id>`; do not submit a duplicate job.
- Do not overwrite an existing asset unless replacement is explicit. Pass `--force` only in that case.
- Do not commit remote storage URLs as the only image source. Download project-bound assets into the repository.
- Read [references/api.md](references/api.md) only when extending or debugging the CLI's API behavior.
