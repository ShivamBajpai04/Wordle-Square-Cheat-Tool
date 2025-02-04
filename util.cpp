#include <iostream>
#include <fstream>
#include <string>
#include <set>
#include <algorithm>
#include <unordered_set>
#include <cstdio> // for std::rename and std::remove
using namespace std;

void removeWordsWithSuffix()
{
    ifstream inputFile("output.txt");
    ifstream updfile("words.txt");
    ofstream tempFile("temp.txt");
    string line;
    unordered_set<string> badWords;
    if (!inputFile)
    {
        cerr << "Unable to open file ";
        return;
    }

    while (getline(inputFile, line))
    {
        if (line.size() >= 2 && line.compare(line.size() - 2, 2, "--") == 0)
        {
            badWords.insert(line.substr(0, line.size() - 2));
        }
    }

    inputFile.close();

    while (getline(updfile, line))
    {
        if (badWords.find(line) == badWords.end())
        {
            tempFile << line << endl;
        }
    }
    tempFile.close();
    updfile.close();
    // Remove the original file
    if (remove("words.txt") != 0)
    {
        cerr << "Error deleting file ";
        return;
    }

    // Rename temp.txt to the original filename
    if (rename("temp.txt", "words.txt") != 0)
    {
        cerr << "Error renaming file";
        return;
    }
}

int makeFileUnique()
{
    ifstream inputFile("words.txt");
    ofstream tempFile("temp.txt");
    string line;
    set<string> uniqueWords;

    if (!inputFile)
    {
        cerr << "Unable to open file words.txt";
        return 1;
    }

    while (getline(inputFile, line))
    {
        transform(line.begin(), line.end(), line.begin(), ::tolower);
        uniqueWords.insert(line);
    }

    for (const auto &word : uniqueWords)
    {
        tempFile << word << endl;
    }

    inputFile.close();
    tempFile.close();
    if (remove("words.txt") != 0)
    {
        cerr << "Error deleting file";
        return 1;
    }
    // Rename temp.txt to output.txt
    if (rename("temp.txt", "words.txt") != 0)
    {
        cerr << "Error renaming file";
        return 1;
    }

    return 0;
}

int main()
{
    // makeFileUnique();
    removeWordsWithSuffix();
}
