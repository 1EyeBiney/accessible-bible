brief_version: 1.3

## §0 AGENT DIRECTIVES
- Read this file end-to-end on session boot. Recite §11 in first reply.
- Read latest §14 entry before acting.
- Match user request → §15 Activation Map. Load matched Spokes only.
- On conflict with §5 INVARIANTS: BLOCK AND ASK. No exceptions.
- On conflict with §6 DECISIONS: pause, surface decision, require explicit reopen.
- On conflict with §7 PREFERENCES: proceed; note deviation in one line.
- After completing a §12 task: propose Save State diff before next action.
- Never re-emit full files. Diff or surgical edit only.
- Never echo this file back mid-session.
- Batch clarifying questions into one turn.
- gemini.md (Master Watchdog Directive) is canonical for navigation/audio engine; this brief governs process and context. On contradiction, gemini.md wins for engine behavior; brief wins for workflow.

## §1 PINNED CONTEXT
- App: Accessible Bible. Offline-first, keyboard-driven, screen-reader-first web app.
- Host: GitHub Pages, www.accessible-bible.org. License: MIT.
- Stack: static ES modules, no bundler, IndexedDB, Web Speech API, AudioContext, importmap.
- Active cycle: Update Cycle 2 — JIT Study Plan pipeline.
- App version: v69.4.1. Brief version: 1.3.
- Active task: Visual accessibility overhaul of the Options Menu and Vault Input (v69.5).
- IndexedDB: BibleStudyDB v7. apiKeys + studyPlans stores added; user stores preserved.
- BYOK: user supplies Gemini key, stored locally; no hosted key, no telemetry.
- gemini.md is the engine rulebook; do not contradict it.
- Anti-truncation protocol applies to every edit over ~50 lines.

## §2 PROJECT
- Name: Accessible Bible.
- Pitch: Offline-first, keyboard-driven Bible study tool for screen-reader users with continuous-autoplay engine, audio codex tutorial, commentary overlays, and BYOK AI study-plan generator.
- URL: https://www.accessible-bible.org
- Repo: github.com/1EyeBiney/accessible-bible
- License: MIT.
- Audience: NVDA / JAWS / VoiceOver users; low-vision users via theme + font scaling.

## §3 TECH STACK
- Language: JavaScript (ES modules, browser-native).
- Build: none. Static files served from GitHub Pages.
- Storage: IndexedDB (BibleStudyDB v7) + localStorage (preferences).
- TTS: Web Speech API (`#aria-announcer`). Cues: AudioContext synthesizer. Hymns: HTML5 audio.
- AI: `@google/generative-ai` via importmap → `https://esm.run/@google/generative-ai`. Model: `gemini-2.5-flash`.
- Browser floor: latest evergreen (Chrome/Edge/Firefox/Safari). Desktop-focused. Mobile deferred.
- Governance: gemini.md (Master Watchdog Directive v0.58.0) for engine; this brief for workflow.
- Dev tooling: Node sandbox under `/data/` for offline scripts; `dotenv` for sandbox-only secrets.

## §4 CONVENTIONS
- Versioning (app): `vNN.N`. Major bump = architectural shift or completed update cycle. Minor bump = feature/fix. No patch tier. No public build counts.
- Versioning (brief): `brief_version: X.Y`. Y bumps on every save-state. X bumps on milestone.
- File naming: module files = `camelCase.js` (`keyboard.js`, `autoplay.js`). Class-bearing files = `PascalCase.js` (`GeminiProvider.js`, `PlanValidator.js`).
- Folders: `jit/` bounded context for AI feature; `data/` for offline build scripts; `commentaries/`, `translations/`, `audio/` for assets.
- JSON manifests: kebab-case keys; lowercase filenames.
- Changelog format: `vXX.Y — short description` with `### Added/Fixed/Changed` blocks.
- Commit messages: short imperative; tag with version when releasing.
- Comments: minimal; explain *why*, never *what*.
- DOM IDs: kebab-case (`#focus-trap`, `#visual-buffer`, `#aria-announcer`).
- Mode flags: `is<Name>Mode` boolean exports from `keyboard.js`.
- Setter pattern: ES module imports are read-only; cross-module state changes go through `set<Thing>` exports.
- Curriculum IDs: integer formula `(book_number * 1000000) + (chapter * 1000) + verse` for cross-dataset matching.
- Educator pipeline: notes-as-commentary export uses unique string-based IDs, not the math formula.
- Composite cache key: `slugify(topic|filter|model|schemaVersion|manifestId)`.
- Heartbeat pulse: 220 Hz / 0.05 s / 2.5 s interval during long ops.

## §5 INVARIANTS
- a. Every keystroke must be screen-reader-announced or audibly cued.
- b. No raw API key may ever be logged, displayed in full, or transmitted anywhere except the configured provider endpoint.
- c. `TEXT_STORE` is the only IndexedDB store that may be bulldozed on upgrade. `NOTES_STORE`, `BOOKMARKS_STORE`, `COMMENTARY_STORE`, `apiKeys`, `studyPlans` MUST be preserved across all future upgrades.
- d. All long-running operations must be cancellable (AbortController + hard timeout).
- e. No global keystroke handler may fire while an input mode owns the keyboard. Mode flags are mutually exclusive.
- f. Every JIT plan must pass `PlanValidator` before being announced or cached.
- g. Pastorally-harmful sensitivity matches must never reach the LLM. Sensitive-Topic Detector runs before any API call.
- h. No external API may be contacted except the configured provider endpoint and the static asset hosts (GitHub Pages, esm.run).
- i. The gemini.md Master Watchdog Directive must always be followed to prevent ghost code, regression, or shadowed state.
- j. No browser modals (`alert`, `prompt`, `confirm`) in any navigation path.
- k. `#focus-trap` must reclaim focus on blur unless an explicit input mode flag is set.
- l. RAM cache (`memoryCache`) is the only legitimate read source for navigation; IndexedDB is touched only for note/bookmark/commentary lookups.
- m. The splash screen `#init-button` is the sole entry point; first user interaction must satisfy browser autoplay/audio policy.
- n. Education output IDs must remain string-based; do not migrate notes export to the integer curriculumId.
- o. `clearAllModes()` must run before any new input-binding mode activates, including detaching `activeInputHandler`.

## §6 DECISIONS
- D-001 BYOK over hosted key (cost + privacy + scale).
- D-002 Flat 7-class error hierarchy under `StudyPlanError` with mandatory `userMessage`, `recoverable` fields. No deep inheritance.
- D-003 Two-tier regex sensitivity classifier: Tier A phrases / Tier B word+marker; academic-context demoter present.
- D-004 `closing_reflection` schema field for reframed responses to sensitive topics.
- D-005 Composite cache key spec — see §4. Cache miss falls through to provider.
- D-006 30 s hard timeout + 2.5 s heartbeat pulse + completion tone for JIT loading state.
- D-007 `jit/` bounded context. Outer Wall in `keyboard.js`; Inner Wall in `jit/orchestrator.js`.
- D-008 B1 idempotent listener pattern on shared `searchInputEl`. Single `activeInputHandler` slot; `clearAllModes()` detaches.
- D-009 IndexedDB schema v7 with `oldVersion < 7` upgrade gate. Future bumps preserve `apiKeys`/`studyPlans`.
- D-010 `whenDbReady()` promise gate for any module that may import before init completes.
- D-011 ES module + importmap; no bundler. Maintains zero-build deploy story.
- D-012 Gemini model locked at `gemini-2.5-flash`; `responseSchema` enforced server-side.
- D-013 RAM-cache-first reads; IndexedDB only for annotations and feature data.
- D-014 Setter pattern for cross-module state (no direct mutation across module boundaries).
- D-015 Curriculum integer ID for cross-dataset commentary lookup.
- D-016 Educator pipeline preserves string IDs on notes-as-commentary export.
- D-017 Bulldoze-on-upgrade only for `TEXT_STORE`; all other stores conditional-create with `if (!contains)` guards.
- D-018 Dual-store transactions for read-time sync (notes + commentary in single tx).
- D-019 Bookmark contextual filter: bookmarks scoped per active document via memoryCache validation, yielding 10-bookmark quota per document.
- D-020 Audio Codex tutorial overlay isolated as `isTutorialMode`; full media-player keymap inside.
- D-021 Autoplay engine standalone (`autoplay.js`); batch-load architecture; dynamic `aria-live` muting during playback.
- D-022 Library architecture: `L` opens Master Library Menu; manifests fetched with `cache: 'no-store'`; books and Bibles share `./translations/`.
- D-023 Literature mode: `activeReadMode` flag drives label switch (Verse↔Paragraph), TTS metadata suppression, and Chronos time-jump math.
- D-024 Welcome airlock + skip flag in localStorage; `role="application"` on overlays to lock screen readers into Forms mode.
- D-025 Visual buffer is sighted-only; `aria-hidden="true"` on all sighted HUD elements.
- D-026 Notes/commentary read directly from RAM where possible; bracket parser keeps `[[ ]]` audible for non-sighted users.
- D-027 Modifier collision avoidance: `Y` for commentary (not Shift+Up) since screen readers eat Shift+arrow.
- D-028 `F12` for Keyboard Explorer (not `K`) to avoid bookmark-key collision.
- D-029 No mid-task save-state writes; save-state only on completed roadmap items, invariant changes, or explicit user request.
- D-030 No emojis in chat output by default.
- D-031 BYOK provider literal centralized at call sites as `ACTIVE_PROVIDER` const (orchestrator.js, keyboard.js). R-7 promotes to runtime selector.
- D-032 `GEMINI_MODEL` lives in `config.js`; both orchestrator and provider import from a single source.
- D-033 Cache lookup runs BEFORE vault key check in orchestrator. Key-less users may replay cached plans offline.
- D-034 `manifestId` passed as orchestrator parameter (not read from localStorage inside JIT context). Inner Wall stays decoupled from app-level storage.
- D-035 GeminiProvider races `generateContent` against `signal.addEventListener('abort')` for true cancellation.

## §7 PREFERENCES
- Surgical edits over file rewrites.
- Anti-truncation protocol on any rewrite > ~50 lines.
- Tables/bullets over prose in chat.
- Diff-then-write for save-state.
- No emojis unless explicitly requested.
- No markdown docs created unless asked.
- Code blocks use language fences.
- One-fact-per-line in this brief.
- Acronyms defined once in §10, then reused.
- Numbers as digits, not words.
- File links use workspace-relative markdown links.
- Independent reads issued in parallel.
- One terminal command at a time.
- Confirm completion in ≤2 sentences after edits.
- Block early on conflict, before doing the work.

## §8 KNOWN HAZARDS
- H-001 Focus-trap blur reclaim hijacks input modes if mode flag missing from exclusion list. Always add new mode flags to the blur guard.
- H-002 Chained listeners on `searchInputEl` cause double-fire on Enter. Always route through `activeInputHandler`.
- H-003 DB version downgrade throws `VersionError` and locks app. Do not rollback `DB_VERSION`.
- H-004 Auto-summary truncates session memory mid-task. §1 PINNED CONTEXT must restate critical state.
- H-005 Variable shadowing across modules causes ReferenceError/strict-mode crashes (v0.30.7 family of bugs).
- H-006 Ready-state handshake: `isReady` must flip only after `memoryCache` is populated, never before.
- H-007 IndexedDB async trap: idle transactions auto-close during network latency. Resolve fetch fully before opening tx.
- H-008 Race condition in `readCurrentVerse` if memoryCache empty during hot-swap. Guard with cache-populated check.
- H-009 Visual buffer scroll intercept can hijack ArrowUp/Down across menus. Always whitelist new menu modes in `isMenuMode`.
- H-010 Modifier keys (Shift+arrow) intercepted by screen readers as text-selection. Avoid for navigation.
- H-011 Manifest browser cache served stale data. Always fetch with `cache: 'no-store'`.
- H-012 Welcome/Tutorial overlays must use `role="application"` + `tabindex="0"` + immediate `.focus()` or screen readers drop into Browse mode.
- H-013 Bookmark cache cross-contamination across loaded documents. Always filter against active memoryCache.
- H-014 Schema-absurd LLM responses break `JSON.parse`. Wrap parse with custom `ParsingError`.
- H-015 Sound 91 commentary cue and bookmark cue collide if both fire same tick. Stagger 150 ms / 300 ms.
- H-016 `clearAllModes()` invoked after a new mode flag is set will wipe the new mode. Always call before flipping.
- H-017 Importmap not honored if Content-Type wrong on host. Verify on first deploy.
- H-018 Long-running JIT calls without AbortController orphan promises after page unload.
- H-019 Pre-R-4 orchestrator signature `(topic, filter, apiKey, memoryCache, opts)` did not match the keyboard.js call site `(topic, filter, opts)` — JIT was non-functional in v66.0. Fixed in R-4 by aligning signature to call. Lesson: type the public API of bounded contexts at the seam, not internally.
- H-020 SDK `generateContent` does not natively honor AbortSignal. Must race against a manual abort listener or the 30 s timeout orphans the request.

## §9 CORE FILES
- `app.js` — Engine, RAM cache, DB orchestration, focus trap, splash/welcome/tutorial lifecycle.
- `keyboard.js` — Global key router, all mode flags, JIT outer wall, idempotent listener slot.
- `audio.js` — TTS routing + AudioContext cue synthesizer + ambient hymn crossfader.
- `autoplay.js` — Continuous-reading engine, neural-voice batch loader, ARIA muting.
- `ui.js` — `#aria-announcer` `speak()`, `#visual-buffer` updaters, menu visual renderer.
- `db.js` — IndexedDB pipeline, caches, `whenDbReady`, store preservation contract.
- `config.js` — Constants, store names, DB_VERSION, themes, hymn list.
- `index.html` — DOM, importmap, splash, focus-trap element, hidden form fields.
- `jit/orchestrator.js` — Inner wall: pipeline coordinator, error mapping.
- `jit/errors.js` — Flat StudyPlanError hierarchy.
- `jit/sensitivity.js` — Two-tier safety classifier with academic demoter.
- `jit/GeminiProvider.js` — Wire protocol, responseSchema, schema coercion.
- `jit/PlanValidator.js` — Fuzzy-match plan validator.
- `jit/vault.js` — (planned) API key local store.
- `jit/planCache.js` — (planned) Validated plan cache with LRU.
- `commentaries/manifest.json` — Curriculum library index.
- `translations/manifest_bibles.json` — Bible translation index.
- `translations/manifest_books.json` — Literature index.
- `gemini.md` — Master Watchdog Directive (engine canon).

## §10 GLOSSARY
- Outer Wall — `keyboard.js` try/catch + mode-flag layer around JIT.
- Inner Wall — `orchestrator.js` try/catch around provider+validator.
- JIT — Just-In-Time topical study plan generated via BYOK Gemini.
- BYOK — Bring Your Own Key.
- Vault — local IndexedDB store of user-supplied API keys (`apiKeys`).
- Plan Cache — local IndexedDB store of validated study plans (`studyPlans`).
- Sensitivity Classifier — two-tier regex safety filter run before any API call.
- Heartbeat Pulse — 2.5 s repeating 220 Hz tone during JIT loading.
- Focus Trap — `#focus-trap` element holding keyboard focus when no input mode is active.
- Mode Flag — exported boolean from `keyboard.js` indicating an exclusive input state.
- Bulldoze — delete-and-recreate object store on DB upgrade.
- Anti-Truncation Protocol — surgical-edit-only rule for any large file change.
- Audio Codex — accessible audio-tutorial overlay (`isTutorialMode`) playing chaptered MP3 lessons.
- Autoplay Engine — standalone Web Speech API continuous-reading subsystem with batch-loaded neural voices.
- Visual Buffer — `#visual-buffer` modal showing keystroke echo and menu state to sighted helpers.
- Visual HUD — `#visual-hud` legend bar; sighted-only (`aria-hidden="true"`).
- Curriculum ID — integer `(book*1e6)+(chapter*1e3)+verse` for commentary cross-lookup.
- Educator Pipeline — notes-export-as-commentary path; uses string IDs.
- Library — Master menu hierarchy under `L` key (Bibles, Books, Commentaries).
- Literature Mode — `activeReadMode = 'book'`: paragraph labels, suppressed verse numbers.
- Chronos — time-based scrubbing engine (Shift+arrow time jumps).
- Active Read Mode — `'bible'` vs `'book'` toggle that drives label/TTS rules.
- Idempotent Listener — single-handler-slot pattern on shared input element.
- Watchdog Directive — gemini.md, the operational rulebook for engine behavior.

## §11 CURRENT STATUS
- Active task: Visual accessibility overhaul of the Options Menu and Vault Input (v69.5).
- App version: v69.4.1. Brief version: 1.3.
- Last completed: v69.2 Study Library (Recent/Alpha/Favorites views, 'K' pinning, LRU eviction protection) and v69.4.1 JIT Audio Heartbeat hotfix (800Hz Lifeboat echo).
- Blockers: none.
- Awaiting: R-5.1 diff (Options Menu + Vault Input visual accessibility).

## §12 ROADMAP
- [x] R-1 Build `jit/vault.js` (getKey/setKey/clearKey/redactedDisplay/hasKey).
- [x] R-2 Build `jit/planCache.js` (buildCacheKey/get/put/evictIfOverCap).
- [x] R-3 Wire vault into Options menu UX (Save/Replace/Clear key, redacted readout).
- [x] R-4 Wire orchestrator → vault (pre-call) and planCache (read-through). Includes signal propagation, GEMINI_MODEL config promotion, manifestId parameter.
- [ ] R-5 Cycle 2 close: Task 2.7 engine integration — hand validated plan to autoplay. [DEFERRED]
- [ ] R-5.1 Cycle 2 Detour: Fix visual accessibility gaps in the Options Menu and Vault Input for sighted users.
- [ ] R-6 Cycle 3: post-launch hardening — encryption envelope for vault.
- [ ] R-7 Cycle 3: multi-provider abstraction (Anthropic, OpenAI).
- [ ] R-8 Cycle 4: mobile accessibility strategy.
- [x] R-0 Cycle 2 Tasks 2.1–2.6 schema portion (errors, sensitivity, provider, validator, orchestrator, schema).

## §13 OPEN QUESTIONS
- OQ-1 DB v7 vs v8 deploy decision — RESOLVED at v7. Confirmed.
- OQ-2 Encryption-at-rest for stored API keys — DEFERRED to post-launch (Cycle 3).
- OQ-3 F-mode word-search listener routing through `activeInputHandler` — DEFERRED; current bug surface clean.
- OQ-4 Multi-provider abstraction (Anthropic, OpenAI) — DEFERRED to Cycle 3.
- OQ-5 Mobile accessibility strategy — DEFERRED.
- OQ-6 Plan cache eviction policy — RESOLVED: lazy LRU fired post-get and post-put; soft cap PLAN_CACHE_SOFT_CAP. (R-2)
- OQ-7 Vault UX — RESOLVED: immediate overwrite + TTS announce; no in-DOM confirmation per Invariant j. (R-3)
- OQ-8 Cache re-validation — RESOLVED: PlanValidator re-runs on every `get()`; failure evicts the record and returns null. (R-2)

## §14 SESSION LOG
- S-2026-05-08 v69.2 + v69.4.1 shipped: Advanced Library Management implemented with virtual views, first-letter navigation, and pinning immunity. JIT heartbeat upgraded to 800Hz 'Lifeboat' using `playEcho` utility. App bumped to v69.4.1. Brief bumped to 1.3.
- S-2026-05-04 R-3 + R-4 shipped: Options menu now exposes Save/Replace/Clear Gemini Key with redacted readout (`isVaultInputMode` + B1 listener + password-type input toggle). Orchestrator wired to vault + planCache; cache-before-vault for offline replay; manifestId now a parameter; GEMINI_MODEL promoted to config.js; AbortSignal propagated through GeminiProvider via Promise.race. Pre-R-4 signature mismatch fixed. App bumped v66.0 → v66.1.
- S-2026-05-04 R-1 + R-2 shipped: `jit/vault.js` (headless, no UI coupling, plaintext + reserved keyEnvelope) and `jit/planCache.js` (re-validate on read, lazy LRU on get + put, console.warn on poisoned records). Spoke contracts honored end-to-end.
- S-2026-05-04 v1.0 brief locked: Hub-and-Spoke architecture spec adopted; gemini.md/.changelog.md/.roadmap.txt ingested; project_brief.md v1.0 cut.
- S-2026-05-04 v66.0 brief-architecture session: locked Hub-and-Spoke spec, completed Phase 2 interview, drafted brief v0.1.
- S-2026-05-03 v66.0: built apiKeys/studyPlans stores, whenDbReady, oldVersion gate, surgical config+db edits.
- S-2026-05-03 v65.2: focus-trap exclusion (`isJitInputMode`/`isJitLoading`) + B1 idempotent listener atomic patch.
- S-2026-05-03 v65.1: importmap inserted; @google/generative-ai resolution fixed.
- S-2026-05-02 v65.0: jit/ bounded context complete; orchestrator + outer wall integrated.
- S-2026-05-01 v64.0: PlanValidator with fuzzy match + aggressive node filter.
- S-2026-04-30 v63.0: errors.js flat hierarchy + sensitivity.js + GeminiProvider.js authored.
- S-2026-04-29 Sandbox stress-test pass; Cycle 1 Reconnaissance completed.

## §15 SPOKE ACTIVATION MAP
- accessibility.md — files: app.js, keyboard.js, ui.js, index.html | keywords: focus, aria, screen reader, mode, announcement
- data-persistence.md — files: db.js, config.js | keywords: indexeddb, schema, migration, store, upgrade
- audio.md — files: audio.js, autoplay.js | keywords: tts, audiocontext, hymn, voice, speech rate, cue
- jit-feature.md — files: jit/*, keyboard.js (G case) | keywords: jit, gemini, byok, vault, cache, sensitivity, validator
- module-discipline.md — keywords: refactor, edit, anti-truncation, surgical, importmap, module
- library-curriculum.md — files: app.js (L key), commentaries/, translations/ | keywords: library, manifest, commentary, literature, autoplay range
- _index.md — registry of the above with one-line purpose each.

## §16 SAVE STATE PROTOCOL
- Triggers: roadmap task completed | invariant added/changed | architectural decision finalized | user says "save state".
- Forbidden: mid-task writes; speculative writes; full-file rewrites.
- Format: agent proposes unified diff in chat; user confirms; agent applies via surgical edit; brief_version Y bumps by 1.
- Append rules: §14 SESSION LOG append-one (evict oldest at 10 → `_archive/sessions-YYYY-QN.md`); §6 DECISIONS append (evict at 20 → `_archive/decisions.md`); §8 KNOWN HAZARDS append, never evict.
- Overwrite rules: §11 CURRENT STATUS overwrite; §12 ROADMAP edit-in-place (strikethrough done, add new).
- Tripwires: brief > 400 lines → halt edits, propose archive sweep | spoke > 150 lines → halt, propose split | duplicate fact in brief + spoke → halt, dedupe to spoke.
- Audit cadence: every 5th save-state, perform full re-read pass and propose pruning candidates.
