#include <iostream>
#include <algorithm>
#include <vector>
#include <map>
#include <set>
#include <unordered_set>
#include <fstream>
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
    unordered_set<string> cache = readWordsFromFile("words.txt");

    set<string, decltype(cmp)> words(cmp);
    vector<vector<char>> grid = {
        {'c', 'o', 'i', 'b'},
        {'q', 'u', 'm', 'h'},
        {'m', 'i', 'e', 'y'},
        {'p', 'l', 'y', 'c'},
    };

    findWords(grid, words, cache, 16);

    writeWordsToFile("output.txt", words);

    return 0;
}