# 🚀 PRO C++ CLI Core

The ultimate Developer Experience (DX) for C++ on Windows. Inspired by Angular and .NET CLI. 
Stop fighting with compilers, start writing code.

## 🛠 Prerequisites

This tool is designed for **Windows** and requires **Visual Studio 2022** (Community, Pro, or Enterprise).

1. **Install C++ Workload:** Ensure "Desktop development with C++" is checked in Visual Studio Installer.
2. **Node.js:** Install the latest LTS version.

## 📦 Installation

```cmd
npm install -g pro-cpp-cli-core
```

🚀 Quick Start

 1. Create a new folder and open it in VS Code.

 2. Initialize the project:
```cmd
procpp init
```
 3. Start the magic watcher:
```cmd
procpp watch
```

---

⚠️ Important: Terminal Setup
To use `procpp` inside VS Code terminal, you MUST use the Developer Environment:

 1. Press `Ctrl + Shift + P`.

 2. Type `Terminal: Select Default Profile`.

 3. Select `Developer PowerShell for VS 2022`.

 4. Open a NEW terminal.

Now `cl.exe` is recognized, and `procpp` can build your code!

---

✨ Features

 • `procpp init`: Creates `main.cpp` and perfect `.vscode` configs for a "one-click" debugging experience (F5). 

 • `procpp run`: Compiles all `.cpp` files in the directory and runs them.

 • `procpp watch`: Professional-grade hot-reload. It bypasses Antivirus locks by using unique executable naming and handles process recycling automatically.

---

🐞 Debugging

Just press F5! Our `init` command sets up a "Bulletproof" debugger configuration that won't conflict with the watcher.

Created with ❤️ for the C++ Community.

