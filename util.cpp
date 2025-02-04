#include <iostream>
#include <fstream>
#include <string>
#include <set>
#include <unordered_set>
#include <vector>
#include <cstdio>
#include <algorithm>

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
        cerr << "Unable to open file output.txt";
        return;
    }

    // Collect bad words from output.txt
    while (getline(inputFile, line))
    {
        if (line.size() >= 2 && line.compare(line.size() - 2, 2, "--") == 0)
        {
            badWords.insert(line.substr(0, line.size() - 2));
        }
    }
    inputFile.close();

    // Process words.txt and write to temp.txt
    while (getline(updfile, line))
    {
        if (badWords.find(line) == badWords.end())
        {
            tempFile << line << endl;
        }
    }
    updfile.close();
    tempFile.close();

    // Replace original file
    remove("words.txt");
    rename("temp.txt", "words.txt");
}

void removeNonAlphabeticWords(string filename = "words.txt")
{
    ifstream inputFile(filename);
    ofstream tempFile("temp.txt");
    string line;
    if (!inputFile)
    {
        cerr << "Unable to open file " << filename;
        return;
    }

    while (getline(inputFile, line))
    {
        bool isAlphabetic = all_of(line.begin(), line.end(), ::isalpha);
        if (isAlphabetic)
        {
            tempFile << line << endl;
        }
    }

    inputFile.close();
    tempFile.close();

    remove(filename.c_str());
    rename("temp.txt", filename.c_str());
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
    inputFile.close();

    for (const auto &word : uniqueWords)
    {
        tempFile << word << endl;
    }
    tempFile.close();

    remove("words.txt");
    rename("temp.txt", "words.txt");

    return 0;
}

void removeWordsGreaterThanLimit()
{
    ifstream inputFile("words.txt");
    ofstream tempFile("temp.txt");
    string line;
    if (!inputFile)
    {
        cerr << "Unable to open file ";
        return;
    }

    while (getline(inputFile, line))
    {
        if (line.size() <= 16)
        {
            tempFile << line << endl;
        }
    }

    inputFile.close();
    tempFile.close();

    remove("words.txt");
    rename("temp.txt", "words.txt");
}

int main()
{
    removeWordsGreaterThanLimit();
    // removeWordsWithSuffix();
    // removeNonAlphabeticWords();
    // makeFileUnique();
    return 0;
}
