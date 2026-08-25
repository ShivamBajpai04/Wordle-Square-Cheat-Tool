#include <iostream>
#include <algorithm>
#include <vector>
#include <map>
#include <set>
#include <unordered_set>
#include <unordered_map>
#include <fstream>
#include <string>
#include <sstream>
#include <tuple>
#include <cctype>
#include <filesystem>

using namespace std;

int dx[] = {1, -1, 1, -1, -1, 1, 0, 0};
int dy[] = {1, -1, -1, 1, 0, 0, 1, -1};
char dirLabel[] = {'1', '2', '3', '4', 'U', 'D', 'R', 'L'};

struct WordInfo
{
    string word;
    int startRow, startCol;
    string directions;
};

auto cmp = [](const WordInfo &lhs, const WordInfo &rhs)
{
    return make_tuple(lhs.word.length(), lhs.word) < make_tuple(rhs.word.length(), rhs.word);
};

bool isSafe(int x, int y, int n)
{
    return x >= 0 && x < n && y >= 0 && y < n;
}

void dfs(const vector<vector<char>> &grid, vector<vector<bool>> &visited, int i, int j,
         string &path, string &dirs, int startR, int startC,
         set<WordInfo, decltype(cmp)> &results, unordered_set<string> &found,
         const unordered_set<string> &words, const unordered_set<string> &prefixes,
         int targetLength, int minLength)
{
    const int n = (int)grid.size();
    path.push_back(grid[i][j]);

    // Every word is a prefix of itself, so a path that is not a prefix of any
    // candidate cannot grow into one. Without this the search walks all ~12M
    // simple paths of a 4x4 board instead of the few thousand worth visiting.
    if (!prefixes.count(path))
    {
        path.pop_back();
        return;
    }

    if ((int)path.size() >= minLength && words.count(path) && !found.count(path))
    {
        found.insert(path);
        results.insert({path, startR, startC, dirs});
    }
    if ((int)path.size() == targetLength)
    {
        path.pop_back();
        return;
    }
    visited[i][j] = true;
    for (int k = 0; k < 8; k++)
    {
        int x = i + dx[k];
        int y = j + dy[k];
        if (isSafe(x, y, n) && !visited[x][y])
        {
            dirs.push_back(dirLabel[k]);
            dfs(grid, visited, x, y, path, dirs, startR, startC,
                results, found, words, prefixes, targetLength, minLength);
            dirs.pop_back();
        }
    }
    visited[i][j] = false;
    path.pop_back();
}

unordered_set<string> readWordsFromFile(const string &filename)
{
    unordered_set<string> words;
    ifstream infile(filename);
    if (!infile.is_open())
    {
        cout << "";
        return words;
    }
    string word;
    while (infile >> word)
    {
        words.insert(word);
    }
    infile.close();
    return words;
}

// Narrows the dictionary to words this grid could actually spell before
// expanding prefixes. A word needs each of its letters to be available on the
// board, since a cell is used at most once per word. Filtering first keeps the
// prefix set small, which matters because every request runs its own process.
void buildSearchSets(const unordered_set<string> &dictionary,
                     const vector<vector<char>> &grid,
                     int minLength, int targetLength,
                     unordered_set<string> &words,
                     unordered_set<string> &prefixes)
{
    int gridCounts[26] = {0};
    for (const auto &row : grid)
    {
        for (char c : row)
        {
            gridCounts[c - 'a']++;
        }
    }

    int wordCounts[26];
    for (const string &word : dictionary)
    {
        const int len = (int)word.size();
        if (len < minLength || len > targetLength)
        {
            continue;
        }

        fill(begin(wordCounts), end(wordCounts), 0);
        bool spellable = true;
        for (char c : word)
        {
            if (c < 'a' || c > 'z' || ++wordCounts[c - 'a'] > gridCounts[c - 'a'])
            {
                spellable = false;
                break;
            }
        }
        if (!spellable)
        {
            continue;
        }

        words.insert(word);
        for (int i = 1; i <= len; i++)
        {
            prefixes.insert(word.substr(0, i));
        }
    }
}

void findWords(const vector<vector<char>> &grid, set<WordInfo, decltype(cmp)> &results,
               unordered_set<string> &found, const unordered_set<string> &words,
               const unordered_set<string> &prefixes,
               int targetLength, int minLength)
{
    int n = (int)grid.size();
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            vector<vector<bool>> visited(n, vector<bool>(n, false));
            string path;
            string dirs;
            dfs(grid, visited, i, j, path, dirs, i, j, results, found, words,
                prefixes, targetLength, minLength);
        }
    }
}

int main()
{
    string p = filesystem::current_path().string();
    unordered_set<string> cache = readWordsFromFile(p + "/words.txt");
    set<WordInfo, decltype(cmp)> results(cmp);
    unordered_set<string> found;
    string inputLine;

    if (!getline(cin, inputLine) || inputLine.empty())
    {
        cout << "";
        return 0;
    }

    // Input is "<letters...> <depth>"
    istringstream iss(inputLine);
    vector<string> tokens;
    string token;
    while (iss >> token)
        tokens.push_back(token);

    if (tokens.size() < 2)
    {
        cout << "";
        return 0;
    }

    int targetLength;
    try
    {
        targetLength = stoi(tokens.back());
    }
    catch (...)
    {
        cout << "";
        return 0;
    }
    tokens.pop_back();

    // Classic is 4x4 (16), Mini is 3x3 (9)
    const int count = (int)tokens.size();
    if (count != 9 && count != 16)
    {
        cout << "";
        return 0;
    }

    const int n = (count == 9) ? 3 : 4;
    const int minLength = (n == 3) ? 3 : 4;

    if (targetLength < minLength || targetLength > count)
    {
        cout << "";
        return 0;
    }

    vector<vector<char>> grid(n, vector<char>(n));
    for (int i = 0; i < count; i++)
    {
        if (tokens[i].size() != 1 || !isalpha(static_cast<unsigned char>(tokens[i][0])))
        {
            cout << "";
            return 0;
        }
        grid[i / n][i % n] = static_cast<char>(tolower(static_cast<unsigned char>(tokens[i][0])));
    }

    unordered_set<string> words;
    unordered_set<string> prefixes;
    buildSearchSets(cache, grid, minLength, targetLength, words, prefixes);

    findWords(grid, results, found, words, prefixes, targetLength, minLength);

    string res;
    for (const auto &info : results)
    {
        if (!res.empty())
            res += ' ';
        res += info.word + ':' + to_string(info.startRow) + ',' + to_string(info.startCol) + ':' + info.directions;
    }
    cout << res;
    return 0;
}
