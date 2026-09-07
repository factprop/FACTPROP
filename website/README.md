# FACTPROP Explorer

Academic project page and an interactive explorer of forward-edge object in-degree.

## Use the explorer

- **Sentence:** enter an entity name or an English sentence. Inspect the matched labels and QIDs before interpreting scores.
- **Dataset:** upload TXT, Markdown, CSV, TSV, JSON, or JSONL once. The browser produces local matches and prepares a limited semantic preview; remote context-aware linking runs only after explicit consent.

No fixed schema is required. For structured files, `text`, `sentence`, `prompt`, `question`, and `content` fields are preferred. If none exist, the explorer extracts text from arbitrary columns or nested string values. This flexibility can include metadata, so users must review extracted text and matched entities before interpreting results or consenting to remote semantic analysis.

The upload limit is 5 MB. The first 5,000 non-empty rows are analyzed, with a maximum of 20,000 characters per row.

The semantic request preview is limited to 20 rows, 2,000 characters per row, and 8,000 characters total. Selecting a file only performs local processing; sending requires explicit consent. See [`../semantic-api/README.md`](../semantic-api/README.md).

## Matching and scores

Matching uses English labels and limited context rules. Translations, misspellings, abbreviations, and ambiguous names may not resolve correctly. An unmatched entity has no resolved score; it should not be interpreted as zero popularity.

Scores come from `data/entities.json`. They count forward factual edges pointing to each graph node. No model generates these values. A shared QID does not justify summing scores or selecting the maximum.

## Local preview

From the repository root:

```bash
python3 -m http.server 4173 --directory website
```

Open `http://localhost:4173`.

## Index export

Given the trusted source graph:

```bash
python3 -m pip install networkx
python3 website/scripts/export_graph_index.py /path/to/factprop_graph_v1.pkl website/data/entities.json
```

This creates a derived index and leaves the source graph unchanged. See the [data guide](../docs/DATA.md) for its schema.

## Regression checks

```bash
node website/tests/audit.cjs
```

The script reports label-matching regressions and upload checks separately from broader challenge cases. Passing regression checks does not establish general entity-linking accuracy.
