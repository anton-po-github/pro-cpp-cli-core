#!/usr/bin/env node

/**
 * PRO C++ CLI Core (With C++20 Modules Topological Sorter)
 * FIX: Restored initProject!
 * FIX: Smart post-build artifact routing to .build/ directory!
 * NEW: Build time measurement using performance.now()
 * NEW: Native ANSI terminal colors for PRO Developer Experience
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const [,, command, ...args] = process.argv;
let currentAppProcess = null;
let watchTimeout = null;

const BUILD_DIR = path.join(process.cwd(), '.build');

// ANSI Color codes for a beautiful console UI (Zero dependencies!)
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    bold: "\x1b[1m"
};

function runSyncCommand(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

function cleanupOldBuilds() {
    // 1. Clean .build folder
    if (fs.existsSync(BUILD_DIR)) {
        const files = fs.readdirSync(BUILD_DIR);
        files.forEach(file => {
            if (file.endsWith('.obj') || file.endsWith('.pdb') || file.endsWith('.ilk') || file.endsWith('.ifc') || file.startsWith('app_build_')) {
                try { fs.unlinkSync(path.join(BUILD_DIR, file)); } catch (err) {}
            }
        });
    }
    // 2. Clean root folder (just in case)
    const rootFiles = fs.readdirSync(process.cwd());
    rootFiles.forEach(file => {
        if (file.endsWith('.obj') || file.endsWith('.pdb') || file.endsWith('.ilk') || file.endsWith('.ifc') || (file.startsWith('app_build_') && file.endsWith('.exe'))) {
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
                // Ignore .build directory so watcher doesn't loop
                if (file !== 'node_modules' && file !== '.vscode' && file !== '.build') {
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
        
        return { file, exports: exportsMatch ? exportsMatch[1] : null, imports: importsMatches };
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
    console.log(`${colors.cyan}${colors.bold}🚀 Initializing PRO C++ Project (C++20 Modules)...${colors.reset}`);
    const vscodeDir = path.join(process.cwd(), '.vscode');
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir);

    // 1. tasks.json
    const tasksContent = {
        "version": "2.0.0",
        "tasks": [{
            "type": "cppbuild",
            "label": "DEBUG-BUILD-MSVC",
            "command": "cl.exe",
            "args": ["/std:c++20", "/Zi", "/EHsc", "/nologo", "/Fe${fileDirname}\\.build\\debug_build.exe", "${file}"],
            "problemMatcher": ["$msCompile"],
            "group": "build"
        }]
    };
    fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), JSON.stringify(tasksContent, null, 4));

    // 2. c_cpp_properties.json (FIX FOR IDE SQUIGGLES!)
    const propertiesContent = {
        "configurations": [{
            "name": "Win32",
            "includePath": ["${workspaceFolder}/**"],
            "compilerPath": "cl.exe",
            "cStandard": "c17",
            "cppStandard": "c++20",
            "intelliSenseMode": "windows-msvc-x64",
            "compilerArgs": [
                "/std:c++20",
                "/experimental:module",
                "/ifcSearchDir",
                "${workspaceFolder}/.build"
            ]
        }],
        "version": 4
    };
    fs.writeFileSync(path.join(vscodeDir, 'c_cpp_properties.json'), JSON.stringify(propertiesContent, null, 4));

    // 3. settings.json (Hide .build folder from UI)
    const settingsContent = {
        "files.exclude": {
            ".build": true,
            "**/.build": true
        },
        "C_Cpp.errorSquiggles": "disabled"
    };
    fs.writeFileSync(path.join(vscodeDir, 'settings.json'), JSON.stringify(settingsContent, null, 4));

    // 4. main.cpp template
    const mainCppPath = path.join(process.cwd(), 'main.cpp');
    if (!fs.existsSync(mainCppPath)) {
        fs.writeFileSync(mainCppPath, `import std.core;\n// C++20 Modules ready!\nint main() {\n    return 0;\n}`);
    }

    console.log(`${colors.green}✅ Ready! .vscode configs created. IntelliSense is pointed to .build/${colors.reset}`);
}

function buildAndRun() {
    const cppFiles = getSortedCppFiles();
    if (!cppFiles) {
        console.error(`${colors.red}❌ Error: No .cpp or .ixx files found!${colors.reset}`);
        return;
    }

    if (currentAppProcess) currentAppProcess.kill();
    cleanupOldBuilds();
    if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR);

    const outputExeName = `app_build_${Date.now()}.exe`;
    
    console.log(`\n${colors.cyan}🔨 Compiling with SMART DEPENDENCY GRAPH...${colors.reset}`);
    
    // Clean compile command, no weird flags
    const compileCmd = `cl.exe /std:c++20 /nologo /EHsc ${cppFiles} /Fe"${outputExeName}"`;
    
    // Start the timer!
    const startTime = performance.now();
    
    if (runSyncCommand(compileCmd)) {
        // Stop the timer!
        const endTime = performance.now();
        const buildTime = ((endTime - startTime) / 1000).toFixed(2);

        // Move all artifacts to .build folder
        const files = fs.readdirSync(process.cwd());
        files.forEach(file => {
            if (file.endsWith('.obj') || file.endsWith('.ifc') || file.endsWith('.pdb') || file.endsWith('.ilk') || file === outputExeName) {
                try {
                    fs.renameSync(path.join(process.cwd(), file), path.join(BUILD_DIR, file));
                } catch(e) {}
            }
        });

        console.log(`${colors.green}${colors.bold}⚡ [Success] Compiled in ${buildTime}s${colors.reset}`);
        console.log(`${colors.yellow}🟢 RUNNING -> .build\\${outputExeName}${colors.reset}\n` + `${colors.gray}${"-".repeat(40)}${colors.reset}`);
        
        // Run from .build folder
        currentAppProcess = spawn(`.\\.build\\${outputExeName}`, [], { shell: true, stdio: 'inherit' });
        currentAppProcess.on('close', (code) => {
            if (code !== null) console.log(`${colors.gray}${"-".repeat(40)}${colors.reset}\n${colors.red}🛑 Process exited with code ${code}${colors.reset}`);
        });
    } else {
        console.log(`\n${colors.red}${colors.bold}❌ BUILD FAILED${colors.reset}`);
    }
}

function watchProject() {
    console.clear();
    console.log(`${colors.cyan}${colors.bold}👀 PRO C++ Watcher Started (Mode: Smart C++20 Modules)${colors.reset}`);
    buildAndRun();

    fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        // Ignore changes inside .build to prevent infinite loops
        if (filename && (filename.endsWith('.cpp') || filename.endsWith('.ixx') || filename.endsWith('.h')) && !filename.includes('.build')) {
            clearTimeout(watchTimeout);
            watchTimeout = setTimeout(() => {
                console.clear();
                console.log(`${colors.gray}[${new Date().toLocaleTimeString()}] Change detected: ${filename}${colors.reset}`);
                buildAndRun();
            }, 300);
        }
    });
}

switch (command) {
    case 'init': initProject(); break;
    case 'run': buildAndRun(); break;
    case 'watch': watchProject(); break;
    default: 
        console.log(`${colors.bold}🛠️ PRO CPP CLI${colors.reset}\nUsage: procpp <init|run|watch>`); 
        break;
}