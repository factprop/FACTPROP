# FACTPROP

**Popular Knowledge Propagates More Errors in LLM Knowledge Updating**

[Project page & demo](https://factprop.github.io/FACTPROP/) · [Dataset: entity index](https://huggingface.co/datasets/factprop/FACTPROP) · [Code guide](docs/CODE_GUIDE.md) · [Data guide](docs/DATA.md)

FACTPROP is a factual graph for studying how knowledge updates affect connected facts in large language models. The paper examines which facts are vulnerable to collateral errors and how those errors extend across graph distances. It also studies **PopAnchor**, a strategy for retaining popular facts during updating.

## Research overview

- **Factual structure:** 100,015 entities and 432,562 verified factual edges across 39 relation types, as reported in the paper.
- **Controlled updates:** compare model answers to the same questions before and after factual updates.
- **Error propagation:** trace correct-to-incorrect changes among facts initially answered correctly, across distances one through five.
- **Popularity-based anchoring:** study whether preserving high-connectivity facts reduces collateral forgetting.

Structural popularity is the **forward-edge object in-degree** of an entity: the number of forward factual edges pointing to it. It does not measure search frequency or public familiarity. The explorer reports this graph statistic, not a predicted model error rate.

## Repository guide

| Component | Location | Contents |
| --- | --- | --- |
| Graph construction | [`graph_builder/`](graph_builder/) | Ontology, expansion, entity resolution, validation, and export |
| Knowledge updating | [`main.py`](main.py), [`src/`](src/) | Update orchestration, model evaluation, and diagnostic probes |
| Analysis | [`src/analysis/`](src/analysis/), [`src/report/`](src/report/) | Analysis and report utilities |
| Anchor experiments | [`scripts/external_eval/`](scripts/external_eval/) | Matched anchor selection, structural audit, and aggregation |
| Configurations | [`config/`](config/), [`configs/`](configs/) | Model settings and training configuration examples |
| Interactive explorer | [`website/`](website/) | Academic project page, browser index, and dataset analysis |
| Documentation | [`docs/`](docs/) | Data definitions and code usage |

## Try the explorer

Open the [project page](https://factprop.github.io/FACTPROP/), or preview it from the repository root:

```bash
python3 -m http.server 4173 --directory website
```

Visit `http://localhost:4173`. Enter an entity name or upload TXT, CSV, or JSON. See the [explorer guide](website/README.md) for supported formats and matching limitations.

The index is included at [`website/data/entities.json`](website/data/entities.json). For example, `Apple Inc.` has forward object in-degree **467**, while the fruit entity `Apple` has **4**. These are separate graph entities.

## Research code

See the [code guide](docs/CODE_GUIDE.md) for entry points and inputs. Run commands from the repository root. GPU experiments require a model-compatible training and evaluation environment, model access, and the corresponding experiment data.

This initial code release includes research utilities and configuration examples. It is not a complete, validated reproduction bundle for every paper table. Script defaults include experimental settings; consult the paper when choosing a setting.

## Data availability

The entity popularity index is available on [Hugging Face](https://huggingface.co/datasets/factprop/FACTPROP), with a dataset preview, loading examples, and file checksums. The same browser index is included in this repository. The full graph package is still being prepared. The index contains entity labels, QIDs where available, and graph scores, but does not contain the full triples or evaluation QA.

Missing QIDs and multiple graph nodes sharing a QID require explicit handling. See the [data guide](docs/DATA.md).

## Citation

The public preprint and final bibliographic entry will be added when available. The paper title is:

> Popular Knowledge Propagates More Errors in LLM Knowledge Updating

## Acknowledgments

The academic page layout is inspired by [Nerfies](https://nerfies.github.io/). The research code uses external libraries including NetworkX, Hugging Face Transformers, PEFT, and LLaMA-Factory.
