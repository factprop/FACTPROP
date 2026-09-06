# Code guide

## Explorer and graph scores

The explorer runs without a model or GPU. Its scoring index is included in the repository. See the [explorer guide](../website/README.md).

## Knowledge-updating pipeline

`main.py` coordinates controlled updates and model comparisons. `src/accuracy_classifier_fair.py`, `src/async_confidence_prober.py`, and `src/improved_confidence_probing.py` provide evaluation and diagnostic components. The vLLM entry point is `src/vllm_pipeline_main.py`.

Run research commands from the repository root. `requirements.txt` preserves the original environment dependency list; it is not a universal lockfile for all models. Training requires a compatible LLaMA-Factory installation with `llamafactory-cli` on the executable search path. vLLM evaluation requires a separate compatible vLLM installation. Choose library versions supported by the selected model.

With an existing experiment JSON, model environment, and model access configured:

```bash
python main.py --help
python src/vllm_pipeline_main.py --help
```

Experiment records contain a target fact and distance-indexed `ripples`. Keep question wording and evaluation records fixed across the clean and updated model. Correct-to-incorrect flip rates must use facts answered correctly before updating as their denominator.

## Anchor-selection utilities

`scripts/external_eval/select_anchors_v2_matched.py` implements an object-popularity selection variant. `audit_anchors_v2_matched.py` audits its outputs; `aggregate_block_b.py` aggregates experiment reports.

```bash
python scripts/external_eval/select_anchors_v2_matched.py --help
python scripts/external_eval/audit_anchors_v2_matched.py --help
```

These utilities include historical experimental settings. In particular, the matched selector's default budget of 25 must not be confused with other anchor budgets in the paper. Its graph-degree conventions must be checked against the input graph's treatment of inverse edges. These scripts are not presented as a validated reproduction of every reported PopAnchor result.

## Analysis and reporting

`src/analysis/` and `src/report/` contain research utilities for model comparisons, diagnostic summaries, and figures. Supply the corresponding experiment outputs and review each script's input schema before use. Full experiment outputs and model checkpoints are not included in this repository.
