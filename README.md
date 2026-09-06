# Squares Solver

A Chrome extension and server implementation for solving word puzzles on [Squares](https://squares.org/). The project includes both a C++ solver and a Chrome extension interface.

## Project Structure

```
.
├── main/                   # Scratch C++ utilities (not shipped)
│   ├── util.cpp           # Dictionary utilities
│   └── clean_txt_file.cpp # Dictionary cleaning utility
│
├── server/                 # Node.js server + dictionary pipeline
│   ├── index.js           # Express server implementation
│   ├── code.cpp           # The solver (the only copy that ships)
│   ├── words.txt          # Dictionary the solver searches
│   ├── confirmed-words.txt # Every word the game has shown as an official
│   │                       # answer; pruning may never delete from this set
│   └── scripts/
│       ├── scrape-and-solve.mjs # Scrapes a board's answers + solves its grid
│       ├── update-words.mjs     # Applies the day's adds/prunes (tested)
│       ├── prune-gate.mjs       # Decides when a board may be pruned against
│       ├── notify.mjs           # Telegram sender
│       ├── solver.mjs           # Runs the compiled solver
│       └── daily-stats.mjs      # Daily accuracy report + Telegram notifier
│
├── stats/
│   ├── history.json       # Daily accuracy history (appended by CI)
│   └── prune-gate.json    # Evidence for whether each board may be pruned
│
└── squares-extension/      # Chrome extension
    ├── manifest.json      # Extension configuration
    ├── background_scripts/
    │   └── background.js  # Background service worker
    ├── content_scripts/
    │   └── content.js     # Page interaction script
    └── popup/             # Extension popup UI
        ├── popup.html
        ├── popup.css
        └── popup.js
```

## Dictionary pipeline

A daily GitHub Action scrapes yesterday's official answers for both boards,
solves the same grids, and reconciles the two:

- **Adds** every official answer missing from `words.txt`.
- **Prunes** predicted words the answer list did not contain — but only when the
  solver actually ran and the scrape cleared a per-board floor, and **never** a
  word recorded in `confirmed-words.txt`. The daily answer list is the only
  evidence available and it is not always complete, so a word the game has once
  confirmed is never deleted on a later day's say-so.
- **Mini** starts add-only and unlocks itself. There is no flag to flip.

### The prune gate

Pruning against a board's answer list is only safe if that list is exhaustive.
Classic's demonstrably is (46-129 answers per board); mini's is unproven, and if
it were a curated subset, pruning against it would delete valid words.

The gate settles this from evidence rather than a guess. Both boards share one
vocabulary, so a word already in `confirmed-words.txt` that the solver places on
today's grid **must** appear in today's answers. Each such word is one
observation; one that is missing is proof the list is a subset.

- Mini prunes once **40 observations across 7 days** pass with zero omissions.
  If the list omitted even 10% of valid words, surviving that is a ~1.5% fluke.
- A single omission resets the streak, and re-locks the board if it had
  unlocked. Unlock and re-lock are both pushed to Telegram; daily progress rides
  along in the accuracy report.
- Days with a thin scrape or a failed solve carry no evidence, so they neither
  advance nor break the streak.
- Classic runs the same measurement with `--observe`: it records evidence
  without being governed by it, acting as the control for what a healthy board
  looks like.

State lives in `stats/prune-gate.json`, committed by CI alongside the dictionary
it authorises. The rules live in `server/scripts/update-words.mjs` and
`server/scripts/prune-gate.mjs`, both covered by `npm test`.


## Features

- Chrome extension for easy interaction with Squares puzzles
- Fast C++ solver implementation
- Node.js server to bridge extension and solver
- Supports word lengths from 4 to 16 characters
- Draggable results window
- Word grouping by length
- Local caching of results
- Auto-play that drags the solved words on the board for you
- Daily accuracy tracking with a Telegram report

## Daily Accuracy Reports

A GitHub Action runs daily, scrapes yesterday's grid and its official answers,
solves the grid, and compares the two to maintain the dictionary. The same run
reports how the solver performed.

Metrics:

| Metric | Meaning |
| --- | --- |
| Recall | Share of the official answers the solver found |
| Precision | Share of the solver's predictions that were real answers |
| Missed | Official answers the solver failed to find (missing dictionary entries) |
| False positives | Predictions that weren't real answers (junk dictionary entries) |

Each run appends an entry to `stats/history.json` and sends a Telegram message
that includes the day-over-day change in recall and precision.

To enable notifications, add two repository secrets under
Settings → Secrets and variables → Actions:

- `TELEGRAM_BOT_TOKEN` — token from [@BotFather](https://t.me/BotFather)
- `TELEGRAM_CHAT_ID` — the chat to post into

If either secret is missing the report is still computed, logged, and committed;
only the send is skipped. To preview a report locally:

```bash
cd server && npm run stats
```

## Installation

### Server Setup

1. Navigate to the server directory:

```sh
cd server
npm install
node index.js
```

The server will run on port 3000.

### C++ Solver Setup

1. Compile the C++ code:

```sh
cd main
g++ -o code code.cpp
```

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `squares-extension` directory

## Usage

1. Visit [Squares](https://squares.org/)
2. Click the extension icon
3. Set your desired maximum word length (4-16)
4. Click "Solve"
5. View results in the draggable window

## Components

### Chrome Extension

- **Popup UI**: User interface for controlling the solver
- **Content Script**: Extracts grid data and displays results
- **Background Script**: Handles API communication and caching

### Server

- Express.js server that bridges the extension and C++ solver
- Handles grid solving requests
- Returns found words to the extension

### C++ Solver

- Fast implementation of the word search algorithm
- Validates words against a dictionary
- Supports configurable word lengths

## Development

### Extension Development

- The extension uses vanilla JavaScript and CSS
- Content script injects UI into the page
- Background script manages state and API calls

### Server Development

- Built with Express.js
- Uses child_process to communicate with C++ solver
- Simple REST API for solving requests

## API Endpoints

- `POST /solve`
  - Body: `{ grid: string, depth: number }`
  - Returns: `{ output: string }`

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.
