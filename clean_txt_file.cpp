//read words.txt and if the line has | symbol, delete from the start up to and including the pipe symbol
#include<iostream>
#include<fstream>
#include<string>
using namespace std;

int main()
{
    ifstream file("words.txt");
    ofstream temp("temp.txt");
    string line;
    while(getline(file, line))
    {
        int pos = line.find("|");
        if(pos != string::npos)
        {
            line.erase(0, pos + 2);
        }
        temp << line << endl;
    }
    file.close();
    temp.close();
    remove("words.txt");
    rename("temp.txt", "words.txt");
    return 0;
}