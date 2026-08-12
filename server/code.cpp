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

void dfs(vector<vector<char>> &grid, vector<vector<bool>> &visited, int i, int j,
         string path, string dirs, int startR, int startC,
         set<WordInfo, decltype(cmp)> &results, unordered_set<string> &found,
         unordered_set<string> &cache, int targetLength, int minLength)
{
    int n = (int)grid.size();
    path += grid[i][j];
    if ((int)path.size() >= minLength && cache.count(path) && !found.count(path))
    {
        found.insert(path);
        results.insert({path, startR, startC, dirs});
    }
    if ((int)path.size() == targetLength)
    {
        return;
    }
    visited[i][j] = true;
    for (int k = 0; k < 8; k++)
    {
        int x = i + dx[k];
        int y = j + dy[k];
        if (isSafe(x, y, n) && !visited[x][y])
        {
            dfs(grid, visited, x, y, path, dirs + dirLabel[k], startR, startC,
                results, found, cache, targetLength, minLength);
        }
    }
    visited[i][j] = false;
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

void findWords(vector<vector<char>> &grid, set<WordInfo, decltype(cmp)> &results,
               unordered_set<string> &found, unordered_set<string> &cache,
               int targetLength, int minLength)
{
    int n = (int)grid.size();
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            vector<vector<bool>> visited(n, vector<bool>(n, false));
            dfs(grid, visited, i, j, "", "", i, j, results, found, cache,
                targetLength, minLength);
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

    findWords(grid, results, found, cache, targetLength, minLength);

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
