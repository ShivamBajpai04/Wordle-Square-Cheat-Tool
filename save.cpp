#include <iostream>
#include <algorithm>
#include <vector>
#include <map>
#include <queue>
#include <set>
#include <unordered_set>
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

void dfs(vector<vector<char>> &grid, vector<vector<bool>> &visited, int i, int j, string path, set<string, decltype(cmp)> &words,
         int target, unordered_set<string> &cache)
{
    if (path.size() == target)
    {
        if (cache.find(path) == cache.end())
        {
            return;
        }
        words.insert(path);
        return;
    }
    visited[i][j] = true;
    for (int k = 0; k < 8; k++)
    {
        int x = i + dx[k];
        int y = j + dy[k];
        if (isSafe(x, y) && !visited[x][y])
        {
            dfs(grid, visited, x, y, path + grid[i][j], words, target, cache);
        }
    }
    visited[i][j] = false;
}

unordered_set<string> readWordsFromFile(const string &filename)
{
    unordered_set<string> words;
    freopen(filename.c_str(), "r", stdin);
    string word;
    while (cin >> word)
    {
        words.insert(word);
    }
    fclose(stdin);
    return words;
}

void findWords(vector<vector<char>> &grid, set<string, decltype(cmp)> &words, unordered_set<string> &cache)
{
    for (int k = 4; k <= 6; k++)
    {
        for (int i = 0; i < 4; i++)
        {
            for (int j = 0; j < 4; j++)
            {
                vector<vector<bool>> visited(4, vector<bool>(4, false));
                dfs(grid, visited, i, j, "", words, k, cache);
            }
        }
    }
}

void writeWordsToFile(const string &filename, const set<string, decltype(cmp)> &words)
{
    freopen(filename.c_str(), "w", stdout);
    int a = 4;
    cout << "-----------------------------" << a << "---------------------------------" << endl;
    for (const auto &word : words)
    {
        if (a != word.size())
        {
            a = word.size();
            cout << "-----------------------------" << a << "---------------------------------" << endl;
        }
        cout << word << endl;
    }
    cout << "-----------------------------" << a << "---------------------------------" << endl;
    fclose(stdout);
}

int main()
{
    unordered_set<string> cache = readWordsFromFile("words.txt");

    set<string, decltype(cmp)> words(cmp);
    vector<vector<char>> grid = {
        {'o', 'b', 't', 'g'},
        {'s', 'i', 'e', 'u'},
        {'g', 'l', 'x', 'n'},
        {'u', 'i', 'a', 'p'},
    };

    findWords(grid, words, cache);

    writeWordsToFile("output.txt", words);

    return 0;
}