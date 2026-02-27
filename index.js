#!/usr/bin/env node

/**
 * PRO C++ CLI Core (With C++20 Modules Topological Sorter)
 * FIX: Kept .ifc files alive for IntelliSense!
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [,, command, ...args] = process.argv;
let currentAppProcess = null;
let watchTimeout = null;

function runSyncCommand(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

function cleanupOldBuilds() {
    const files = fs.readdirSync(process.cwd());
    files.forEach(file => {
        // PRO FIX: Removed .ifc from deletion list. IntelliSense needs them to resolve imports!
        const isArtifact = file.endsWith('.obj') || file.endsWith('.pdb') || file.endsWith('.ilk') || (file.startsWith('app_build_') && file.endsWith('.exe'));
        if (isArtifact) {
            try { fs.unlinkSync(path.join(process.cwd(), file)); } catch (err) {}
        }
    });
}

function getSortedCppFiles() {
    const fileList = [];
    
    function scanDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                if (file !== 'node_modules' && file !== '.vscode' && file !== 'build') {
                    scanDir(filePath);
                }
            } else if (filePath.endsWith('.cpp') || filePath.endsWith('.ixx')) {
                fileList.push(filePath);
            }
        }
    }
    scanDir(process.cwd());

    const fileData = fileList.map(file => {
        const content = fs.readFileSync(file, 'utf8');
        const exportsMatch = content.match(/export\s+module\s+([a-zA-Z0-9_]+)\s*;/);
        const importsMatches = [...content.matchAll(/import\s+([a-zA-Z0-9_]+)\s*;/g)].map(m => m[1]);
        
        return {
            file,
            exports: exportsMatch ? exportsMatch[1] : null,
            imports: importsMatches
        };
    });

    const sortedFiles = [];
    const visited = new Set();
    const processing = new Set();

    function visit(node) {
        if (visited.has(node.file)) return;
        if (processing.has(node.file)) return;
        processing.add(node.file);

        node.imports.forEach(imp => {
            const dep = fileData.find(f => f.exports === imp);
            if (dep) visit(dep);
        });

        processing.delete(node.file);
        visited.add(node.file);
        sortedFiles.push(`"${node.file}"`);
    }

    fileData.forEach(visit);
    return sortedFiles.join(' ');
}

function initProject() {
    console.log("🚀 Initializing PRO C++ Project (C++20 Modules)...");
    const vscodeDir = path.join(process.cwd(), '.vscode');
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir);

    const mainCppPath = path.join(process.cwd(), 'main.cpp');
    const mainCppContent = `import std.core;\n// C++20 Modules ready!\nint main() { return 0; }`;
    if (!fs.existsSync(mainCppPath)) fs.writeFileSync(mainCppPath, mainCppContent);

    const tasksContent = {
        "version": "2.0.0",
        "tasks": [
            {
                "type": "cppbuild",
                "label": "DEBUG-BUILD-MSVC",
                "command": "cl.exe",
                "args": ["/std:c++20", "/Zi", "/EHsc", "/nologo", "/Fe${fileDirname}\\debug_build.exe", "${file}"],
                "problemMatcher": ["$msCompile"],
                "group": "build"
            }
        ]
    };
    fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), JSON.stringify(tasksContent, null, 4));
    console.log("✅ Ready! Standard set to C++20.");
}

function buildAndRun() {
    const cppFiles = getSortedCppFiles();
    if (!cppFiles) {
        console.error("❌ Error: No .cpp or .ixx files found!");
        return;
    }

    if (currentAppProcess) currentAppProcess.kill();
    cleanupOldBuilds();

    const outputExe = `app_build_${Date.now()}.exe`;
    console.log(`\n🔨 Compiling with SMART DEPENDENCY GRAPH...`);
    
    const compileCmd = `cl.exe /std:c++20 /nologo /EHsc ${cppFiles} /Fe"${outputExe}"`;
    
    if (runSyncCommand(compileCmd)) {
        console.log(`🟢 RUNNING -> ${outputExe}\n` + "-".repeat(40));
        currentAppProcess = spawn(`.\\${outputExe}`, [], { shell: true, stdio: 'inherit' });
        currentAppProcess.on('close', (code) => {
            if (code !== null) console.log("-".repeat(40) + `\n🛑 Process exited with code ${code}`);
        });
    } else {
        console.log(`\n❌ BUILD FAILED`);
    }
}

function watchProject() {
    console.log("👀 PRO C++ Watcher Started (Mode: Smart C++20 Modules)");
    buildAndRun();

    fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.cpp') || filename.endsWith('.ixx') || filename.endsWith('.h'))) {
            clearTimeout(watchTimeout);
            watchTimeout = setTimeout(() => {
                console.clear();
                console.log(`[${new Date().toLocaleTimeString()}] Change detected: ${filename}`);
                buildAndRun();
            }, 300);
        }
    });
}

switch (command) {
    case 'init': initProject(); break;
    case 'run': buildAndRun(); break;
    case 'watch': watchProject(); break;
    default: console.log("🛠️ PRO CPP CLI\nUsage: procpp <init|run|watch>"); break;
}