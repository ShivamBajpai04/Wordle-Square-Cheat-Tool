# Wordle Square

This project is a C++ implementation of a word search algorithm that finds all valid words in a 4x4 grid of characters. The words are validated against a dictionary of words read from a file.

## Features

- Reads a dictionary of words from a file.
- Searches for words of length 4 to 16 in a 4x4 grid.
- Writes the found words to an output file, grouped by their length.
- Provides utility functions to clean and process the dictionary file.

## Files

- `code.cpp`: The main implementation file.
- `words.txt`: The dictionary file containing valid words.
- `output.txt`: The output file where the found words are written.
- `util.cpp`: Contains utility functions for processing the dictionary file.
- `clean_txt_file.cpp`: Contains a utility function to clean lines in the dictionary file (use when importing data form sql).

## How to Use

1. **Compile the code**:
    ```sh
    g++ -o wordle_square code.cpp
    ```

2. **Run the executable**:
    ```sh
    ./wordle_square
    ```

3. **Check the output**:
    The found words will be written to `output.txt`.

## Functions

- `unordered_set<string> readWordsFromFile(const string &filename)`: Reads words from a file and returns them as an unordered set.
- `void findWords(vector<vector<char>> &grid, set<string, decltype(cmp)> &words, unordered_set<string> &cache, int targetLength)`: Finds all valid words in the grid.
- `void writeWordsToFile(const string &filename, const set<string, decltype(cmp)> &words)`: Writes the found words to a file.

## Utility Functions

### util.cpp

- `void removeWordsWithSuffix()`: Removes words with a specific suffix from the dictionary file (use when output word is not in game dictionary, add -- after word).
- `void removeNonAlphabeticWords(string filename = "words.txt")`: Removes non-alphabetic words from the dictionary file.
- `int makeFileUnique()`: Ensures all words in the dictionary file are unique.
- `void removeWordsGreaterThanLimit()`: Removes words longer than a specified limit from the dictionary file.

### clean_txt_file.cpp

- Reads `words.txt` and removes any text before and including the `|` symbol from each line.

## Example

Given the following grid:
```
c o i b
q u m h
m i e y
p l y c
```

And a dictionary file `words.txt` containing:
```
come
home
mice
...
```

The program will find all valid words and write them to `output.txt`.

## Related Game

This helper tool is made for the game [Squares](https://squares.org/).

## License

This project is licensed under the MIT License.
