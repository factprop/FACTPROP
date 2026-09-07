# FACTPROP

**Popular Knowledge Propagates More Errors in LLM Knowledge Updating**

[Project page & demo](https://factprop.github.io/FACTPROP/) · [Graph and entity index](https://huggingface.co/datasets/factprop/FACTPROP) · [Code guide](docs/CODE_GUIDE.md) · [Data guide](docs/DATA.md)

FACTPROP studies how a controlled factual update changes facts connected to it in a language model. The pipeline fine-tunes a base model with LoRA, evaluates the same target and ripple questions before and after the update, and reports correct-to-incorrect flips from distance zero through five. The repository also contains **PopAnchor**, a rehearsal strategy for reducing collateral forgetting.

The graph reported in the paper contains 100,015 entities, 432,562 verified factual edges, and 39 relation types. Structural popularity is the **forward-edge object in-degree** of an entity—not search frequency or public familiarity.

## Repository layout

```text
FACTPROP/
├── main.py                         # End-to-end data generation, LoRA training, and HF evaluation
├── requirements.txt                # Original Python environment; not a universal lockfile
├── config/                         # Model/experiment metadata
├── configs/                        # Standalone LLaMA-Factory configuration examples
├── graph_builder/                  # Graph expansion, validation, scoring, and export
│   ├── enhanced_graph_builder.py
│   ├── concurrent_builder.py
│   ├── stratified_bfs_scheduler.py
│   ├── validation/
│   ├── scoring/
│   └── relations/
├── src/
│   ├── generate_ripple_experiments.py
│   ├── vllm_pipeline_main.py       # In-process vLLM clean-vs-LoRA evaluation
│   ├── vllm_batch_eval.py
│   ├── async_confidence_prober.py
│   ├── accuracy_classifier_fair.py
│   ├── analysis/                   # Diagnostic and statistical analysis
│   └── report/                     # Comparison reports and paper tables
├── scripts/external_eval/          # PopAnchor selection, audit, and aggregation
├── semantic-api/                   # Optional Cloudflare semantic-linking backend
├── website/                        # Static project page and browser explorer
├── docs/                           # Data and code documentation
└── .github/workflows/              # GitHub Pages deployment
```

The following runtime directories are intentionally not committed:

```text
data/                               # Generated LLaMA-Factory datasets and dataset_info.json
results/                            # Ripple experiment files and graph checkpoints
main_output/                        # Integrated training/evaluation runs
outputs/                            # Standalone training outputs
keys/                               # Local API/model-access credentials
```

## What is required for a full run

A full training and evaluation run requires:

- Linux with one or more CUDA GPUs.
- Python and PyTorch versions compatible with the selected model.
- A working `llamafactory-cli` installation.
- A separate vLLM-compatible environment for accelerated evaluation.
- Access to the base model on Hugging Face.
- A ripple experiment file containing the target fact and its evaluation neighborhood.
- An OpenAI key only when the experiment does not already specify `target.poison_answer` or `target.poison_tail`.

The graph checkpoint and browser entity index are public, but production ripple experiment JSON files, model checkpoints, and paper run outputs are not bundled with the repository.

Run all commands below from the repository root.

## Environment setup

### Training and native Hugging Face evaluation

Use a dedicated environment. `requirements.txt` reflects the original environment and pins an older Transformers version; newer model families may require newer Transformers, PEFT, and LLaMA-Factory versions.

```bash
python -m venv .venv-train
source .venv-train/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
git clone --depth 1 https://github.com/hiyouga/LLaMA-Factory.git ../LLaMA-Factory
python -m pip install -e "../LLaMA-Factory[torch,metrics,bitsandbytes]"
llamafactory-cli --help
mkdir -p data keys
```

Pin the LLaMA-Factory revision in a reproducible production environment and follow its [model-specific installation guidance](https://github.com/hiyouga/LLaMA-Factory). Authenticate with Hugging Face using its CLI, or place the token at `keys/hf_key.txt`. If `target.poison_answer` is absent, place the OpenAI key at `keys/openai_key.txt`. Never commit either file.

Verify the entry point after installing dependencies:

```bash
python main.py --help
```

### vLLM evaluation

vLLM frequently requires a different PyTorch/Transformers combination, so install it in a separate environment:

```bash
python -m venv .venv-vllm
source .venv-vllm/bin/activate
python -m pip install --upgrade pip
python -m pip install vllm peft safetensors
python src/vllm_pipeline_main.py --help
```

## Prepare production ripple data

For compatibility with both `main.py` and the vLLM evaluator, use direct `head`, `relation`, `tail`, and `question` fields:

```json
{
  "experiment_id": 1,
  "target": {
    "head": "Eiffel Tower",
    "relation": "located_in",
    "tail": "Paris",
    "question": "Where is the Eiffel Tower located?",
    "poison_answer": "Lyon"
  },
  "ripples": {
    "d1": [
      {
        "head": "Paris",
        "relation": "country",
        "tail": "France",
        "question": "Which country is Paris in?"
      }
    ],
    "d2": [],
    "d3": [],
    "d4": [],
    "d5": []
  }
}
```

Important data rules:

- Keep evaluation questions identical for the clean and updated model.
- Include `question` on every record that should be evaluated.
- Use `d1` through `d5`; `main.py` also accepts historical `dd1` through `dd5`.
- Providing a reviewed `poison_answer` makes the run reproducible and avoids an OpenAI call to invent one.
- Do not train on ripple evaluation questions.
- Correct-to-incorrect flip rate must use only facts answered correctly by the clean model as its denominator.

For one explicit file, it may live anywhere. For example:

```text
results/experiments_ripples_fast_20k/ripple_experiment_001.json
```

For `--mode multi`, the current code scans exactly:

```text
results/experiments_ripples_fast_20k/ripple_experiment_001.json
...
results/experiments_ripples_fast_20k/ripple_experiment_020.json
```

`src/generate_ripple_experiments.py` is a historical generator with hard-coded input/output paths. Review its constants before using it with a new graph; it is not currently a general-purpose CLI.

## End-to-end production workflow

Set reusable paths:

```bash
export BASE_MODEL="meta-llama/Meta-Llama-3-8B"
export EXPERIMENT_FILE="results/experiments_ripples_fast_20k/ripple_experiment_001.json"
export RUN_DIR="main_output/production_exp001"
```

### Option A: train and evaluate with native Hugging Face

This command generates the update dataset, registers it in `data/dataset_info.json`, trains the LoRA adapter, loads the clean model, loads the updated model, and writes a comparison report:

```bash
source .venv-train/bin/activate

python main.py \
  --run_poison_pipeline \
  --experiment_file "$EXPERIMENT_FILE" \
  --base_model "$BASE_MODEL" \
  --output_dir "$RUN_DIR" \
  --poison_method factual \
  --num_poison 150 \
  --num_neutral 400 \
  --num_irrelevant 100 \
  --poison_strategy balanced \
  --epochs 3 \
  --lora_rank 32 \
  --lora_alpha 64 \
  --max_distance d5 \
  --concurrency_limit 16 \
  --quantization_bit 4
```

Native evaluation loads clean and updated models sequentially and can require substantially more time and memory than vLLM. Omit `--quantization_bit 4` when the model or GPU does not support bitsandbytes quantization.

### Option B: train first, then evaluate with vLLM

This is the recommended split for production-scale evaluation.

#### 1. Generate data and fine-tune

```bash
source .venv-train/bin/activate

python main.py \
  --run_poison_pipeline \
  --experiment_file "$EXPERIMENT_FILE" \
  --base_model "$BASE_MODEL" \
  --output_dir "$RUN_DIR" \
  --poison_method factual \
  --num_poison 150 \
  --num_neutral 400 \
  --num_irrelevant 100 \
  --poison_strategy balanced \
  --epochs 3 \
  --lora_rank 32 \
  --lora_alpha 64 \
  --train_only
```

The script prints the final adapter path. With an integer experiment ID, it normally has this shape:

```text
main_output/production_exp001/
└── ripple_experiment_001_<timestamp>/
    ├── training_data/
    ├── models/
    │   └── integrated_poison_001/   # Pass this directory to --lora_path
    ├── evaluation_results/
    └── comparison_reports/
```

Record the exact printed path:

```bash
export LORA_PATH="$RUN_DIR/ripple_experiment_001_<timestamp>/models/integrated_poison_001"
test -f "$LORA_PATH/adapter_config.json"
```

Keep `--lora_rank 32` unless `src/vllm_pipeline_main.py` is also updated: the current vLLM engine sets `max_lora_rank=32`.

#### 2. Start the vLLM evaluation

The repository does **not** start a separate `vllm serve` HTTP server. The following command starts an in-process vLLM engine, evaluates the clean base model, attaches the LoRA adapter, evaluates the same records again, and then exits:

```bash
source .venv-vllm/bin/activate

CUDA_VISIBLE_DEVICES=0 \
VLLM_GPU_MEM=0.88 \
VLLM_MAX_SEQS=128 \
python src/vllm_pipeline_main.py \
  --base_model "$BASE_MODEL" \
  --lora_path "$LORA_PATH" \
  --experiment_file "$EXPERIMENT_FILE" \
  --output_dir "$RUN_DIR/vllm_eval" \
  --max_distance d5
```

For a smoke test, add `--limit 50`. Remove it for the complete evaluation.

All GPUs visible through `CUDA_VISIBLE_DEVICES` are used for tensor parallelism. Reduce `VLLM_GPU_MEM` after an out-of-memory error and reduce `VLLM_MAX_SEQS` when request batching exceeds available memory.

Gemma 4 adapters are copied to a sibling `<lora_path>_vllm` directory and remapped automatically. The vLLM evaluator uses case-insensitive answer containment as its correctness rule; inspect responses before treating the metric as semantic accuracy.

#### 3. Read the vLLM output

The report is written to:

```text
$RUN_DIR/vllm_eval/comparison_reports/<experiment_id>_vllm_comparison.json
```

It contains:

- Clean and updated answers.
- Exact-match correctness.
- Correct-to-incorrect flips.
- Flip rate conditioned on clean-correct facts.
- Clean/updated log-probability margins.
- Statistics grouped by graph distance.

## Evaluate an existing LoRA without retraining

Native Hugging Face path:

```bash
source .venv-train/bin/activate

python main.py \
  --input_file "$EXPERIMENT_FILE" \
  --base_model "$BASE_MODEL" \
  --lora_path "$LORA_PATH" \
  --output_dir "$RUN_DIR/hf_eval_only" \
  --max_distance d5 \
  --concurrency_limit 16 \
  --quantization_bit 4
```

vLLM path:

```bash
source .venv-vllm/bin/activate

CUDA_VISIBLE_DEVICES=0 \
python src/vllm_pipeline_main.py \
  --base_model "$BASE_MODEL" \
  --lora_path "$LORA_PATH" \
  --experiment_file "$EXPERIMENT_FILE" \
  --output_dir "$RUN_DIR/vllm_eval_only" \
  --max_distance d5
```

## Run multiple production experiments

Place numbered files under `results/experiments_ripples_fast_20k/`, then run:

```bash
source .venv-train/bin/activate

python main.py \
  --run_poison_pipeline \
  --mode multi \
  --experiment_range "1-20" \
  --base_model "$BASE_MODEL" \
  --output_dir "main_output/production_batch" \
  --poison_method factual \
  --epochs 3 \
  --lora_rank 32 \
  --lora_alpha 64 \
  --max_distance d5
```

Each experiment receives its own timestamped directory. When native evaluation is enabled, the root output directory also receives `multi_experiment_summary_<timestamp>.json`.

## Training configuration notes

- `main.py` constructs its LLaMA-Factory command dynamically. It does not automatically load `configs/*.yaml`.
- `configs/*.yaml` are standalone examples for manually prepared datasets; their dataset names, model templates, target modules, and output paths must be reviewed before use.
- Training data is copied into `data/` and registered in `data/dataset_info.json` because LLaMA-Factory is invoked with `--dataset_dir data`.
- Batch size is selected from the model name and can be overridden with `LF_BATCH_SIZE` and `LF_GRAD_ACCUM`.
- Models whose names contain `27b`, `31b`, `32b`, or `70b` automatically receive 4-bit training in the integrated path.
- The default `--base_model` is historical. Always pass the intended production model explicitly.

## Output structure

An integrated run produces:

```text
<output_dir>/
├── ripple_experiment_<id>_<timestamp>/
│   ├── training_data/              # Generated ShareGPT update data and metadata
│   ├── models/                     # LoRA adapter
│   ├── evaluation_results/
│   └── comparison_reports/         # Clean-vs-updated report and optional diagnostics
└── multi_experiment_summary_*.json # Multi-run native-HF summary, when applicable
```

Add `--dump_margin` or `--dump_attention` to the native evaluation command to export additional diagnostic files under `comparison_reports/`.

## Interactive explorer

The explorer does not require a GPU:

```bash
python3 -m http.server 4173 --directory website
```

Open `http://localhost:4173`, enter an entity, or upload TXT, Markdown, CSV, TSV, JSON, or JSONL. Dataset files are processed locally first; optional semantic linking requires explicit consent. See [`website/README.md`](website/README.md).

## Data availability

The [Hugging Face release](https://huggingface.co/datasets/factprop/FACTPROP) contains the entity popularity index and the original [`factprop_graph_v1.pkl`](https://huggingface.co/datasets/factprop/FACTPROP/blob/main/factprop_graph_v1.pkl) checkpoint. The index does not contain the full evaluation QA or experiment outputs.

Missing QIDs and multiple graph nodes sharing one QID require explicit handling. Do not sum duplicate-QID degrees or interpret an unresolved entity as degree zero. See the [data guide](docs/DATA.md).

## Reproducibility and scope

This release contains research code and configuration examples, not a validated one-command reproduction bundle for every paper table. Record the exact graph, experiment file, base-model revision, package versions, GPU configuration, random seed, generated training data, and LoRA adapter for each run.

## Citation

The public preprint and final bibliographic entry will be added when available. The paper title is:

> Popular Knowledge Propagates More Errors in LLM Knowledge Updating

## Acknowledgments

The academic page layout is inspired by [Nerfies](https://nerfies.github.io/). The research code uses NetworkX, Hugging Face Transformers, PEFT, vLLM, and LLaMA-Factory.
