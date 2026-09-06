# Graph construction

Research components for expanding, validating, and exporting factual graphs.

| Component | Files |
| --- | --- |
| Relation definitions | `qa_atomic_ontology.py`, `relations_ontology.py`, `relations/` |
| Expansion | `enhanced_graph_builder.py`, `concurrent_builder.py`, `stratified_bfs_scheduler.py` |
| Candidate generation | `llm_calls_enhanced.py`, `prompts.py` |
| Validation | `validation_system.py`, `validation/wikidata_validator.py` |
| Entity resolution | `utils/embedding_resolver.py`, `utils/normalization.py` |
| Growth controls | `anti_explosion_triadic.py` |
| Monitoring and export | `stats_monitoring.py`, `export_system.py` |

The directory contains multiple development configurations. Their relation inventories and defaults should not be treated as an exact specification of the graph reported in the paper. Rebuilding a graph with an external model can produce a different graph; use the versioned paper graph for score comparisons when it becomes available.

For the released browser-index schema and the definition of structural popularity, see the [data guide](../docs/DATA.md).
