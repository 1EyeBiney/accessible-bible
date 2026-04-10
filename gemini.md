# ACCESSIBLE BIBLE ENGINE: MASTER WATCHDOG DIRECTIVE (v0.24.0)

## SYSTEM INSTRUCTION:
You are the Systems Architect for a high-performance, keyboard-centric Bible study tool. The user is a professional software instructor and requires zero-latency navigation.

### 1. The Prime Directive
- **No Browser Modals:** Do not use `alert()` or `prompt()` for core navigation. Use state-based listeners and digit buffers.
- **RAM Cache:** All text must be loaded into the `memoryCache` array from IndexedDB on boot. Indexing this array is the only way to achieve "faster-than-iOS" speeds.
- **ARIA Output:** Use the `#aria-announcer` div. Always clear `textContent` before speaking to force re-announcement.
- **Initialization Protocol:** The app must start with a splash screen (`#splash-screen`) containing a focusable button (`#init-button`). This button captures the first user interaction, satisfies browser autoplay/audio policies, sets `isInitialized = true`, and transfers focus to the `#focus-trap` element before any navigation logic runs. The `#splash-screen` container MUST carry `role="application"` so that screen readers (NVDA, JAWS, VoiceOver) automatically latch into Focus/Forms mode on page load — eliminating the requirement for the user to manually switch modes before pressing the init button.
- **Context-Aware Audio:** Sequential navigation must minimize verbosity. Only the verse number is announced when staying within the same chapter. A chapter change triggers a chapter + verse prefix. A book change (or forced readout) triggers a full Book + Chapter + Verse prefix. This prevents audio fatigue during long reading sessions.
- **Zero-Latency Audio:** System feedback (like note indicators) must use the native `AudioContext` synthesizer (`playTone`, `playSequence`) rather than HTML5 Audio elements to ensure instantaneous execution alongside screen reader TTS.
- **Humanized Ambient Announcements:** Ambient track changes must announce a cleaned, human-friendly title derived from the hymn filename so screen reader output sounds natural.

### 2. Navigation State
- `memoryCache`: Flat array of verse objects `{id, book_name, book_number, chapter, verse, text}`.
- `currentVerseIndex`: The absolute pointer for the array.
- `isBookSearchMode`: When true, alphabetical keys cycle through books.
- `bookmarksCache`: In-memory array of up to 10 bookmarked verse IDs.
- `currentBookmarkIndex`: The bookmark carousel pointer used by Shift-bracket navigation.

### 3. Keybindings
- **Left/Right Arrows:** Sequential verse navigation.
- **Up Arrow:** Instant Read for personal margin note on the current verse.
- **Shift + Up Arrow:** Instant Read for expert commentary on the current verse.
- **Down Arrow:** Opens the vertical Verse Menu (Edit Note, Delete Note, Copy Verse).
- **PageUp/Down:** Chapter jumps. PageDown at last chapter spills to next book.
- **Shift + PageUp/Down:** Book jumps.
- **KeyB:** Activates Book Search mode. Next alpha key cycles books by first letter (repeating the same letter advances to the next match, wrapping around). Enter/Escape/non-alpha exits.
- **KeyF:** Activates Word Search mode. Focus moves to `#search-input`; type query and press Enter to run a full-cache text filter.
- **Key]:** Next Search Result in the result carousel (wraps at end).
- **Key[:** Previous Search Result in the result carousel (wraps at beginning).
- **KeyC:** Activates Chapter mode. Type digits then Enter to jump to that chapter in the current book. Escape cancels.
- **KeyV:** Activates Verse mode. Type digits then Enter to jump to that verse in the current book/chapter. Escape cancels.
- **Shift + V:** Cycle ambient volume (0, 5, 10, 20, 30, 40).
- **KeyM:** Activates Memo mode. Focus moves to `#note-editor` to read/write notes for the current verse. Press Escape to save and exit.
- **KeyR:** Anchor the current verse for relational linking.
- **Backspace:** Breadcrumb backtrack to previous verse from the navigation history stack.
- **Alt + L:** Drop a relational link to the anchored verse into the current verse note.
- **Alt + J:** Omni-Jump. Follows relational links found in BOTH the personal note and the expert commentary.
- **KeyN:** Crossfade to next ambient track and announce the humanized song title.
- **KeyK:** Toggle bookmark for the current verse (add/remove, max 10 bookmarks).
- **Shift + [:** Previous bookmark in the bookmark carousel.
- **Shift + ]:** Next bookmark in the bookmark carousel.
- **KeyS:** Chapter Status Report. Announces `[Book] [Chapter]: [verse count] verses, approximately [word count] words.`
- **KeyTab:** 'Where am I?' status. Forces a full readout of the current Book, Chapter, and Verse without moving the index.
- **F12:** Toggle Keyboard Explorer mode on. While active, keys are announced instead of routed to navigation.
- **KeyE:** Echo Chamber (Diagnostic readout of index, testament, and ready state).
- **KeyO:** Opens the Options Menu to import/export backups and load commentary modules.
- **Escape:** Global clear. Wipes search carousel and any pending digit buffers. Also exits Keyboard Explorer mode.
- **Digit Buffer:** While in Chapter or Verse mode, each digit key is appended to `inputBuffer` and spoken aloud. Enter commits; Escape cancels. Entering a new mode (B/C/V) automatically clears any pending mode and buffer.

### 4. Input Protocol
- **Modal Exclusivity:** Search modes are mutually exclusive. Activating B, C, or V explicitly sets all other mode flags to `false` and clears `inputBuffer` via `clearAllModes()`. There is no state where two modes are simultaneously active.
- **Stealth Entry Protocol:** Text entry for queries or notes must use visually hidden form elements (`#search-input`, `#note-editor`) to leverage native screen reader text-editing features without breaking the focus trap.
- **No Browser Modals:** Navigation never blocks the main thread with `prompt()` or `alert()`.
- **Prevention:** `event.preventDefault()` is called for all navigation keys (arrows, page, mode triggers, digits, Enter within a mode) to suppress browser defaults.
- **Focus Lock:** The `#focus-trap` element uses `role="application"` and `tabindex="0"` to signal to screen readers that all keyboard input should pass directly to the script. A `blur` listener on `#focus-trap` uses `requestAnimationFrame` to immediately reclaim focus whenever it strays, keeping the engine in full keyboard control after initialization.
- **Keyboard Explorer Intercept:** When `isKeyboardExplorer` is active, input is intercepted at the top of `handleInput(event)`. `F12` and `Escape` exit the mode; all other keys are announced via `getKeyboardExplorerDescription(event)`.

### 5. Data Pipeline & Upgrades
- Data corrections require running `cleaner.js`, incrementing the emitted JSON artifact name (for example, `bsb2.json`), updating the app fetch URL, and incrementing `DB_VERSION`.
- Database upgrades must automatically clear and recreate `TEXT_STORE` to force a network refresh of corrected scripture content, while strictly preserving `NOTES_STORE` so user annotations survive upgrades.
- Bookmark data must persist in `BOOKMARKS_STORE` (`userBookmarks`) and be preserved during upgrades.
- `DB_VERSION = 6` introduced `COMMENTARY_STORE` (`expertCommentary`) for static instructor overlays. This store is created on upgrade and preserved across future upgrades alongside `NOTES_STORE` and `BOOKMARKS_STORE`.
- Curriculum/Commentary data is queried using a dynamically generated integer (`(book_number * 1000000) + (chapter * 1000) + verse`) to ensure compatibility across different dataset ID formats.

### 6. Relational Architecture
- **Breadcrumb Stack:** `navigationHistory` stores prior verse indexes before teleport operations so Backspace can return instantly.
- **Anchor/Drop Workflow:** `R` (Anchor) -> `Alt + L` (Link) -> `Alt + J` (Jump) for direct relational navigation.
- **Hybrid Selection Model:** Single-link notes jump immediately; multi-link notes route through the existing menu engine for deterministic keyboard selection.

### 7. Hybrid Accessibility (Low-Vision)
- **CSS Custom Properties:** The `:root` defines `--base-font-size`, `--bg-color`, `--text-color`, and `--accent-color`. Four `[data-theme]` attribute selectors on `<body>` override these variables: `midnight` (white-on-black), `amber` (amber-on-black), `macular` (black-on-yellow), and `cyan` (cyan-on-black).
- **Font Scaling:** `[-]` decreases and `[=]`/`[+]` increases `--base-font-size` by 2px steps (clamped 12–72px) via `document.documentElement.style.setProperty()`. Current size is spoken via TTS.
- **Theme Carousel:** `[T]` advances `currentThemeIndex` through the `THEMES` array (`['default', 'midnight', 'amber', 'macular', 'cyan']`), setting or removing `data-theme` on `<body>`. Active theme name is spoken via TTS.
- **Visual HUD:** `#visual-hud` is a fixed footer bar (border in `--accent-color`) displaying a static key-legend for sighted users. `aria-hidden="true"` keeps it invisible to screen readers.
- **Alert Pills:** `#alert-note` and `#alert-comm` are fixed top-right badges. Both are hidden (`display: none`) at the start of every `readCurrentVerse()` call. `#alert-note` is revealed when an IndexedDB note query returns a non-empty result; `#alert-comm` is revealed when a commentary query returns a hit. Both pills are styled with CSS variable colors so they remain legible across all themes.

---

## Changelog

### v0.23.0 — Sound 91 Commentary Indicator & Dual-Store Navigation
- **`playCommentaryCue()`:** New AudioContext synthesizer function implementing the Sound 91 "Radiation Ping". Uses a `sine` oscillator at 1800 Hz with a 0.04s duration. Echo is produced via a `DelayNode` (0.08s) feeding into a feedback `GainNode` (0.4), creating the radiation ping decay tail.
- **Dual-Store Navigation:** `readCurrentVerse()` now opens a single IndexedDB transaction spanning both `NOTES_STORE` and `COMMENTARY_STORE`. The `curriculumId` is computed as `(book_number * 1000000) + (chapter * 1000) + verse`. If a commentary record exists for the current verse, `playCommentaryCue()` is triggered via `setTimeout(..., 150)` to provide a staggered audio signature after the screen reader TTS begins announcing the verse text.

### v0.24.0 — Low-Vision Hybrid Interface & Theme Engine
- **CSS Foundation (`index.html`):** Added `:root` custom properties (`--base-font-size: 24px`, `--bg-color`, `--text-color`, `--accent-color`) with four `[data-theme]` overrides on `<body>`: `midnight`, `amber`, `macular`, `cyan`. Applied variables to `body` and `#content-display` (font-size, line-height 1.6, letter-spacing 0.05em).
- **Visual HUD (`index.html`):** Added `#visual-hud` fixed footer with key legend and `#visual-alerts` container holding `#alert-note` and `#alert-comm` badge pills. All elements carry `aria-hidden="true"`.
- **State Variables (`app.js`):** Injected `currentFontSize = 24`, `THEMES` array, and `currentThemeIndex = 0`.
- **Font Scaling Keys:** `[-]` and `[=]`/`[+]` adjust `--base-font-size` by ±2px (clamped 12–72px) via `document.documentElement.style.setProperty()`.
- **Theme Key:** `[T]` cycles `THEMES` carousel, applying `data-theme` attribute to `<body>` (or removing it for `default`).
- **HUD Alert Integration:** `readCurrentVerse()` now hides both pills at the start of every call; `#alert-note` is shown on a successful non-empty note hit; `#alert-comm` is shown on a successful commentary hit.