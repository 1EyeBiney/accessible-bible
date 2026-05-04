# Spoke Registry

One-line index of all Spokes. Activation triggers live in each Spoke's YAML header. Load only what the activation map in `project_brief.md` §15 dictates.

| Spoke | Purpose |
|---|---|
| [`accessibility.md`](accessibility.md) | Screen-reader-first contracts: focus trap, mode flags, ARIA announcements, keystroke audibility. |
| [`audio.md`](audio.md) | TTS routing, AudioContext cue synthesizer primitives, ambient hymn engine, autoplay neural-voice batch loader. |
| [`data-persistence.md`](data-persistence.md) | IndexedDB schema, store preservation contract, `whenDbReady`, manifest fetch discipline. |
| [`jit-feature.md`](jit-feature.md) | JIT Study Plan pipeline: orchestrator, error hierarchy, sensitivity, validator, vault, plan cache. |
| [`library-curriculum.md`](library-curriculum.md) | Master Library menu (`L`), commentary/literature manifests, `activeReadMode`, Chronos. |
| [`module-discipline.md`](module-discipline.md) | ES module + importmap discipline, surgical-edit + anti-truncation protocols, setter pattern. |

## Status
- `jit-feature.md` — authored (v1.0).
- `data-persistence.md` — authored (v1.0).
- `_index.md` — authored (this file).
- `accessibility.md` — pending (lazy author on first trigger).
- `audio.md` — pending.
- `library-curriculum.md` — pending.
- `module-discipline.md` — pending.

## Authoring Rules
- Hard cap: 150 lines per Spoke. Tripwire halts edits and proposes a split.
- YAML frontmatter required: `spoke`, `version`, `activates_when` (`files_touched`, `keywords`), `load_priority`, `supersedes`.
- Body order: INVARIANTS → DECISIONS → HAZARDS → WORKED EXAMPLES → CROSS-REFS.
- Tables/bullets/code only. No prose paragraphs.
- Cross-ref, never duplicate.
