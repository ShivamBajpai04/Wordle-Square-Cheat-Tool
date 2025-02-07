# Squares Solver

A Chrome extension and server implementation for solving word puzzles on [Squares](https://squares.org/). The project includes both a C++ solver and a Chrome extension interface.

## Project Structure

```
.
├── main/                   # C++ solver implementation
│   ├── code.cpp           # Main solver algorithm
│   ├── words.txt          # Dictionary file
│   ├── output.txt         # Solver output file
│   ├── util.cpp           # Dictionary utilities
│   └── clean_txt_file.cpp # Dictionary cleaning utility
│
├── server/                 # Node.js server
│   └── index.js           # Express server implementation
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

## Features

- Chrome extension for easy interaction with Squares puzzles
- Fast C++ solver implementation
- Node.js server to bridge extension and solver
- Supports word lengths from 4 to 16 characters
- Draggable results window
- Word grouping by length
- Local caching of results

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
