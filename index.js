#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [,, command, ...args] = process.argv;

let currentAppProcess = null;
let watchTimeout = null;

// Helper: Safely execute synchronous shell commands
function runSyncCommand(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

// Helper: Clean up old build files to save disk space
function cleanupOldBuilds() {
    const files = fs.readdirSync(process.cwd());
    files.forEach(file => {
        if ((file.startsWith('app_build_') && file.endsWith('.exe')) || file.endsWith('.obj') || file.endsWith('.pdb') || file.endsWith('.ilk')) {
            try {
                fs.unlinkSync(path.join(process.cwd(), file));
            } catch (err) {
                // Ignore errors: file might be locked by OS or Antivirus. We will try next time!
            }
        }
    });
}

// Helper: Get all .cpp files in the directory
function getCppFiles() {
    const files = fs.readdirSync(process.cwd());
    return files.filter(file => file.endsWith('.cpp')).join(' ');
}

// Command: procpp init
function initProject() {
    console.log("🚀 Initializing PRO C++ Project...");
    
    const vscodeDir = path.join(process.cwd(), '.vscode');
    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir);
    }

    const mainCppPath = path.join(process.cwd(), 'main.cpp');
    const mainCppContent = `#include <iostream>\n\n// The main entry point of the application\nint main() {\n    std::cout << "PRO CLI works like magic!\\n";\n    return 0;\n}\n`;

    if (!fs.existsSync(mainCppPath)) {
        fs.writeFileSync(mainCppPath, mainCppContent);
        console.log("✅ Created main.cpp");
    }

    // Generate tasks.json for bulletproof debugging
    const tasksContent = {
        "version": "2.0.0",
        "tasks": [
            {
                "type": "cppbuild",
                "label": "DEBUG-BUILD-MSVC",
                "command": "cl.exe",
                "args": [
                    "/Zi", "/EHsc", "/nologo",
                    "/Fe${fileDirname}\\debug_build_999.exe",
                    "${file}"
                ],
                "options": { "cwd": "${fileDirname}" },
                "problemMatcher": ["$msCompile"],
                "group": "build"
            }
        ]
    };
    fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), JSON.stringify(tasksContent, null, 4));

    // Generate launch.json for bulletproof debugging
    const launchContent = {
        "version": "0.2.0",
        "configurations": [
            {
                "name": "⚙️ PRO C++ Debug",
                "type": "cppvsdbg",
                "request": "launch",
                "program": "${fileDirname}\\debug_build_999.exe",
                "args": [],
                "stopAtEntry": false,
                "cwd": "${fileDirname}",
                "environment": [],
                "console": "integratedTerminal",
                "preLaunchTask": "DEBUG-BUILD-MSVC"
            }
        ]
    };
    fs.writeFileSync(path.join(vscodeDir, 'launch.json'), JSON.stringify(launchContent, null, 4));

    console.log("✅ Created .vscode debugger configs (F5 ready!)");
    console.log("🎯 Project initialized! Run 'procpp watch' to start developing.");
}

// Core Build and Run Logic
function buildAndRun(isWatchMode = false) {
    const cppFiles = getCppFiles();

    if (!cppFiles) {
        console.error("❌ No .cpp files found in this directory!");
        return;
    }

    // 1. Kill previous running instance if it exists
    if (currentAppProcess) {
        currentAppProcess.kill();
        currentAppProcess = null;
    }

    // 2. Background cleanup of unlocked old files
    cleanupOldBuilds();

    // 3. Generate unique executable name to bypass Antivirus/OS locks
    const timestamp = Date.now();
    const outputExe = `app_build_${timestamp}.exe`;
    
    console.log(`\n🔨 Compiling...`);
    const compileCmd = `cl.exe /nologo /EHsc ${cppFiles} /Fe"${outputExe}"`;
    
    const success = runSyncCommand(compileCmd);

    if (success) {
        console.log(`🟢 RUNNING -> ${outputExe}\n` + "-".repeat(40));
        
        // 4. Run the new executable asynchronously so Node.js can keep watching
        currentAppProcess = spawn(`.\\${outputExe}`, [], { shell: true, stdio: 'inherit' });
        
        currentAppProcess.on('close', (code) => {
            if (code !== null) {
                console.log("-".repeat(40) + `\n🛑 Process exited with code ${code}`);
            }
        });
    } else {
        console.log(`\n❌ BUILD FAILED`);
    }
}

// Command: procpp watch
function watchProject() {
    console.log("👀 PRO C++ Watcher Started!");
    console.log("Press Ctrl+C to stop. Watching for file changes...");
    
    // Initial build
    buildAndRun(true);

    // Watch the current directory for changes
    fs.watch(process.cwd(), (eventType, filename) => {
        if (filename && (filename.endsWith('.cpp') || filename.endsWith('.h'))) {
            // Debounce to prevent multiple rapid triggers when saving
            clearTimeout(watchTimeout);
            watchTimeout = setTimeout(() => {
                console.clear();
                console.log(`[${new Date().toLocaleTimeString()}] Change detected in ${filename}`);
                buildAndRun(true);
            }, 300); // 300ms delay
        }
    });
}

// CLI Router
switch (command) {
    case 'init':
        initProject();
        break;
    case 'run':
        buildAndRun(false);
        break;
    case 'watch':
        watchProject();
        break;
    default:
        console.log(`
🛠️  PRO CPP CLI 🛠️
Usage:
  procpp init   - Scaffold C++ project & VS Code debugger configs
  procpp run    - Compile and run all .cpp files once
  procpp watch  - Live reload! Auto-compile and run on file save
        `);
        break;
}