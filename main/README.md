# main/

Scratch C++ utilities used while building the dictionary. **The solver lives in
[`server/code.cpp`](../server/code.cpp)** — that is the only copy that ships and
the only one CI compiles.

A stale duplicate of `code.cpp` and `words.txt` used to sit here and drifted out
of sync (it never got the prefix-pruning rewrite, so it walked all ~12M simple
paths of a 4x4 board). They were removed; use the `server/` copies.
