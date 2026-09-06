# FACTPROP Explorer

Academic project page and an interactive explorer of forward-edge object in-degree.

## Use the explorer

- **Sentence:** enter an entity name or an English sentence. Inspect the matched labels and QIDs before interpreting scores.
- **Dataset:** upload TXT, CSV, or JSON and export the matched-entity summary as CSV.

TXT uses one text per line. CSV accepts a `text`, `sentence`, `prompt`, `question`, or `content` column, or a single column without a header. JSON accepts an array of strings or objects with one of those fields.

The upload limit is 5 MB. The first 5,000 non-empty rows are analyzed, with a maximum of 20,000 characters per row.

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
python3 website/scripts/export_graph_index.py /path/to/final.pkl website/data/entities.json
```

This creates a derived index and leaves the source graph unchanged. See the [data guide](../docs/DATA.md) for its schema.

## Regression checks

```bash
node website/tests/audit.cjs
```

The script reports label-matching regressions and upload checks separately from broader challenge cases. Passing regression checks does not establish general entity-linking accuracy.
