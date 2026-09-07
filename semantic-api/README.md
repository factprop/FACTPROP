# FACTPROP semantic linking backend

Optional Cloudflare Worker backend for context-aware entity linking. The existing local Sentence and Dataset modes remain browser-only.

## Request flow

1. The user reviews text and explicitly consents in `website/`.
2. `POST /link-entities` validates origin, content type and input limits.
3. A SQLite-backed Durable Object enforces daily and per-IP request limits.
4. Workers AI extracts mentions and selects among candidates returned by Wikidata.
5. Scores are looked up in the bundled `website/data/entities.json`; missing or ambiguous graph coverage never receives an inferred score.

The application does not log or store submitted text or model responses. Cloudflare and Wikimedia still process request data under their own policies. CORS is not authentication.

## Local verification

```sh
npm install
npm test
npm run dev
npm run build
```

The local server at `http://127.0.0.1:8787/#explorer` uses fixture responses and does not call Workers AI or Wikidata.

## Deployment safety

`wrangler.toml` enables the approved production endpoint for the exact listed origins. To disable it, deploy once with `--var ENABLED:false`, then set the source configuration to false so the rollback persists.

The current shared test endpoint is:

```text
https://factprop-entity-linker.factprop-semantic-api.workers.dev
```
