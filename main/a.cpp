#include <iostream>
#include <vector>

int main() {
    std::vector<int> v = {1, 2, 3};
    for (int i : v) std::cout << i << " ";
    return 0;
}
