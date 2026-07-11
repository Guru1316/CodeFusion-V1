// languages.js — supported languages, their Monaco IDs, Judge0 IDs,
// default filenames, and Hello World templates.

export const LANGUAGES = {
  c: {
    label: "C",
    monacoId: "c",
    judge0Id: 50, // C (GCC 9.2.0)
    fileName: "main.c",
    template:
`#include <stdio.h>

int main(void) {
    printf("Hello, World!\\n");
    return 0;
}
`,
  },
  cpp: {
    label: "C++",
    monacoId: "cpp",
    judge0Id: 54, // C++ (GCC 9.2.0)
    fileName: "main.cpp",
    template:
`#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
`,
  },
  python: {
    label: "Python",
    monacoId: "python",
    judge0Id: 71, // Python (3.8.1)
    fileName: "main.py",
    template:
`print("Hello, World!")
`,
  },
  java: {
    label: "Java",
    monacoId: "java",
    judge0Id: 62, // Java (OpenJDK 13.0.1)
    fileName: "Main.java",
    template:
`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`,
  },
};

export function getLanguage(key) {
  return LANGUAGES[key] || LANGUAGES.c;
}

export function isSupportedLanguage(key) {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, key);
}
