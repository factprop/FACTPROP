# FACTPROP data

## Availability

The entity popularity index is available in this repository and on [Hugging Face](https://huggingface.co/datasets/factprop/FACTPROP). The Hugging Face release includes JSONL records, the unchanged browser index, metadata, and checksums. The original [final.pkl graph checkpoint](https://huggingface.co/datasets/factprop/FACTPROP/blob/main/final.pkl) is now available with [graph documentation](https://huggingface.co/datasets/factprop/FACTPROP/blob/main/GRAPH.md) and a checksum-verifying loader. Experiment outputs are not included.

## Browser-index schema

`website/data/entities.json` contains two top-level fields:

| Field | Meaning |
| --- | --- |
| `meta` | Graph counts, metric definition, thresholds, source checksum, and export timestamp |
| `entities` | Records in the order `[label, qid, forward_object_in_degree]` |

An empty QID means that the graph record has no QID mapping. It does not imply a missing graph node or a zero score. A real indexed node can have degree zero when no forward edge points to it.

## Structural popularity

For a graph node `o`, count incoming edges whose `is_inverse` attribute is not `true`. Each forward edge contributes one to its object node. Inverse traversal edges are excluded. Scores are tied to this graph version.

The paper reports 100,015 entities, 432,562 factual edges, and 39 relation types. The index metadata distinguishes total stored edges, forward edges, and inverse edges; these counts are not interchangeable.

## Entity mapping

- 33,901 index records have no QID.
- 5,037 QIDs occur in more than one graph-node record.
- QID `Q312` identifies the `Apple Inc.` record with degree 467; `Q89` identifies `Apple` with degree 4.
- Some entities, including the expected QIDs for the Java and Python programming languages, are absent from the current mapping.

Preserve graph-node labels when resolving duplicate QIDs. Do not automatically sum their degrees or choose the largest. Unresolved inputs have an unknown score, not an inferred zero.

Mapping corrections should be maintained as separately reviewed records with their source and graph version. They should not overwrite the original paper graph.

## Minimal loading example

```python
import json
from pathlib import Path

index = json.loads(Path("website/data/entities.json").read_text())
matches = [row for row in index["entities"] if row[1] == "Q312"]
for label, qid, degree in matches:
    print(label, qid, degree)
```
