#include <iostream>
#include <algorithm>
#include <vector>
#include <map>
#include <set>
#include <unordered_set>
#include <fstream>
#include <string>
#include <sstream>
#include <tuple>
#include <filesystem>

using namespace std;

int dx[] = {1, -1, 1, -1, -1, 1, 0, 0};
int dy[] = {1, -1, -1, 1, 0, 0, 1, -1};

auto cmp = [](const string &lhs, const string &rhs)
{
    return make_tuple(lhs.length(), lhs) < make_tuple(rhs.length(), rhs);
};

bool isSafe(int x, int y)
{
    return x >= 0 && x < 4 && y >= 0 && y < 4;
}

void dfs(vector<vector<char>> &grid, vector<vector<bool>> &visited, int i, int j, string path,
         set<string, decltype(cmp)> &words, unordered_set<string> &cache, int targetLength)
{
    path += grid[i][j];
    if (path.size() >= 4 && cache.find(path) != cache.end())
    {
        words.insert(path);
    }
    if (path.size() == targetLength)
    {
        return;
    }
    visited[i][j] = true;
    for (int k = 0; k < 8; k++)
    {
        int x = i + dx[k];
        int y = j + dy[k];
        if (isSafe(x, y) && !visited[x][y])
        {
            dfs(grid, visited, x, y, path, words, cache, targetLength);
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
        cout << "Error opening" << endl;
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

void findWords(vector<vector<char>> &grid, set<string, decltype(cmp)> &words, unordered_set<string> &cache, int targetLength = 10)
{
    int n = grid.size();
    for (int i = 0; i < n; i++)
    {
        for (int j = 0; j < n; j++)
        {
            vector<vector<bool>> visited(n, vector<bool>(n, false));
            dfs(grid, visited, i, j, "", words, cache, targetLength);
        }
    }
}

void writeWordsToFile(const string &filename, const set<string, decltype(cmp)> &words)
{
    ofstream outfile(filename);
    int a = 4;
    outfile << "-----------------------------" << a << "---------------------------------" << endl;
    for (const auto &word : words)
    {
        if (a != word.size())
        {
            a = word.size();
            outfile << "-----------------------------" << a << "---------------------------------" << endl;
        }
        outfile << word << endl;
    }
    outfile.close();
}

int main()
{
    string path = filesystem::current_path().string();
    unordered_set<string> cache = readWordsFromFile(path + "/words.txt");
    set<string, decltype(cmp)> words(cmp);
    vector<vector<char>> grid(4, vector<char>(4));
    string inputLine;

    // Handle empty input
    if (!getline(cin, inputLine) || inputLine.empty())
    {
        cout << ""; // Empty output for empty input
        return 0;
    }

    istringstream iss(inputLine);

    // Check if we have enough characters for the grid
    for (int i = 0; i < 4; i++)
    {
        for (int j = 0; j < 4; j++)
        {
            if (!(iss >> grid[i][j]))
            {
                cout << ""; // Not enough characters
                return 0;
            }
        }
    }

    // Read target word length
    int targetLength;
    if (!(iss >> targetLength))
    {
        cout << ""; // No target length provided
        return 0;
    }

    if (targetLength < 4 || targetLength > 16)
    {
        cout << ""; // Invalid target length
        return 0;
    }

    findWords(grid, words, cache, targetLength);
    string res = "";
    for (const auto &word : words)
    {
        res += word + ' ';
    }
    cout << res;
    return 0;
}