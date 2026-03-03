# 🚀 PRO C++ CLI Core (V1.2.0)

The ultimate Developer Experience (DX) for C++ on Windows. Inspired by Angular and .NET CLI. 
Stop fighting with compilers, start writing code.

<p align="center">
  <img src="https://raw.githubusercontent.com/anton-po-github/pro-cpp-cli-core/main/assets/demo-pro-cpp-cli-core.gif" alt="PRO C++ CLI Demo" width="900">
</p>

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
 4. Build a Library for .NET (DLL mode):
 ```cmd
 procpp watch dll
 ```

---

⚠️ Important: Terminal Setup
To use `procpp` inside VS Code terminal, you MUST use the Developer Environment:

 1. Press `Ctrl + Shift + P`.

 2. Type `Terminal: Select Default Profile`.

 3. Select `Developer PowerShell for VS 2022`.

 4. Open a `NEW terminal`. 💡

Now `cl.exe` is recognized, and `procpp` can build your code!

---

🐞 Advanced C++20 Debugging (The PRO Way)
Want to run the `watch` hot-reload AND step through your code with `F5` at the same time?
We've built a bulletproof PowerShell builder specifically for `C++20 Modules` that completely bypasses Windows file-lock issues.

How to set it up in 2 steps:

 2. Download our magic [build.ps1](https://github.com/anton-po-github/pro-cpp/blob/main/.vscode/build.ps1) and save it inside your `.vscode/ folder`.

 2. Replace your `.vscode/tasks.json` with [this configuration](https://github.com/anton-po-github/pro-cpp/blob/main/.vscode/tasks.json).

 That's it! Press F5 to start debugging. Our script will auto-resolve your C++ module dependencies while keeping the `procpp watch` terminal clean and running in the background.

<p align="center">
  <img src="https://raw.githubusercontent.com/anton-po-github/pro-cpp-cli-core/main/assets/debug-pro-cpp-cli-core.gif" alt="PRO C++ CLI Demo" width="900">
</p>

---

✨ Features (The PRO Way)

💎 Smart C++20 Modules Handling
Forget about manual build order. procpp automatically scans Your .ixx (interfaces) and .cpp files, detects export module and import statements, and performs Topological Sorting to compile everything in the correct order.

---

📦 .NET 10+ Integration Ready
Compiling DLLs for C# usually brings headaches like DllNotFoundException. We fixed it:

 • Static Runtime Linking (/MT): All dependencies are packed into the DLL. No need for VC++ Redistributable on the server.

 • x64 Architecture Enforcement: Automatic checks to ensure Your DLL matches Your .NET runtime architecture.

 • Clean Artifacts: Auto-cleanup of .obj, .exp, .lib, and .pdb files to keep Your workspace pristine.

⌨️ Dynamic DLL Naming
No more hardcoded filenames. You have two ways to name Your library:

 1. Interactive: Just run procpp watch dll and the CLI will ask You for a name.

 2. Fast-Track: Run procpp watch dll MyEngine to skip prompts and build MyEngine.dll immediately.

---

🔄 Advanced Hot-Reload
Our watcher uses unique process management to bypass Windows file-lock issues. It terminates the old process, cleans up, and spawns the new build in milliseconds.

🛠 CLI Usage & Commands


| Command | Target | Argument | Description |
|---|---|---|---|
| `init` | - | - | Setup workspace, `.vscode` configs, and C++ template. | 
| `run` | `exe` / `dll` | `[Name]` | Performs a single-pass compilation. |
| `watch` | `exe` / `dll` | `[Name]` | Starts hot-reload mode. Auto-rebuilds on file changes. |
| `-h` | `--help` | - | Show the beautiful help menu. |
| `-v` | `--version` | - | Show current version. |

Examples:

```
procpp watch dll MediaCore       // Watches and builds MediaCore.dll (Fast-track)
procpp run dll                   // Build DLL once (Interactive prompt)
procpp watch                     // Standard hot-reload for EXE development
```

---

🧐 Why this package?

Tired of configuring CMake and tasks.json for days just to test a simple C++ idea? `pro-cpp-cli-core` brings modern Web Development DX (like Vite/Nodemon) to the C++ world. Zero configuration. Native C++20 Modules support. Just write code.

---

Created with ❤️ for the C++ Community.
