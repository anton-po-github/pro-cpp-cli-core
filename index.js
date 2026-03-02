#!/usr/bin/env node
/**
 * PRO C++ CLI Core (V1.1.1)
 * - Improved Cleanup: Added support for cleaning up old .dll, .lib, and .exp files
 * - Fixed file prefix matching for automated build artifacts
 * - Optimized artifact management in the .build directory
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const packageJson = require('./package.json');

const [,, command, targetMode] = process.argv; // targetMode can be 'dll' or undefined
let currentAppProcess = null;
let watchTimeout = null;
const BUILD_DIR = path.join(process.cwd(), '.build');

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    bold: "\x1b[1m"
};

// --- UTILS ---

/**
 * Validates if the MSVC compiler is available in the current environment.
 */
function checkEnv() {
    try {
        execSync('cl.exe', { stdio: 'ignore' });
        return true;
    } catch (e) {
        console.error(`\n${colors.red}${colors.bold}❌ MSVC Compiler (cl.exe) NOT FOUND!${colors.reset}`);
        console.log(`${colors.yellow}💡 Fix: Please use "Developer PowerShell for VS 2022" or "Developer Command Prompt".${colors.reset}\n`);
        return false;
    }
}

/**
 * Executes a shell command synchronously and inherits stdio.
 */
function runSyncCommand(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Cleans up previous build artifacts to prevent disk clutter.
 * Focuses on 'app_build_' prefix and common MSVC extensions.
 */
function cleanupOldBuilds() {
    if (fs.existsSync(BUILD_DIR)) {
        const files = fs.readdirSync(BUILD_DIR);
        files.forEach(file => {
            const isOurBuild = file.startsWith('app_build_');
            const isArtifact = ['.obj', '.pdb', '.ilk', '.ifc', '.exp', '.lib', '.dll', '.exe'].some(ext => file.endsWith(ext));

            if (isOurBuild || isArtifact) {
                try {
                    // Force delete the old build files
                    fs.unlinkSync(path.join(BUILD_DIR, file));
                } catch (err) {
                    // File might be locked by another process, skip quietly
                }
            }
        });
    }
}

/**
 * Scans for .cpp and .ixx files and sorts them based on module dependencies.
 */
function getSortedCppFiles() {
    const fileList = [];
    function scanDir(dir) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                if (file !== 'node_modules' && file !== '.vscode' && file !== '.build' && !file.startsWith('.')) {
                    scanDir(filePath);
                }
            } else if (filePath.endsWith('.cpp') || filePath.endsWith('.ixx')) {
                fileList.push(filePath);
            }
        }
    }
    scanDir(process.cwd());
    if (fileList.length === 0) return null;

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

// --- COMMANDS ---

/**
 * Initializes a new PRO C++ project with VS Code configurations.
 */
function initProject() {
    console.log(`${colors.cyan}${colors.bold}🚀 Initializing PRO C++ Project...${colors.reset}`);
    const vscodeDir = path.join(process.cwd(), '.vscode');
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir);

    const tasks = {
        "version": "2.0.0",
        "tasks": [{
            "label": "PRO-CPP-BUILD",
            "type": "shell",
            "command": "procpp run",
            "group": { "kind": "build", "isDefault": true }
        }]
    };
    fs.writeFileSync(path.join(vscodeDir, 'tasks.json'), JSON.stringify(tasks, null, 4));

    const props = {
        "configurations": [{
            "name": "Win32",
            "includePath": ["${workspaceFolder}/**"],
            "compilerPath": "cl.exe",
            "cppStandard": "c++20",
            "intelliSenseMode": "windows-msvc-x64",
            "compilerArgs": ["/std:c++20", "/experimental:module", "/ifcSearchDir", "${workspaceFolder}/.build"]
        }],
        "version": 4
    };
    fs.writeFileSync(path.join(vscodeDir, 'c_cpp_properties.json'), JSON.stringify(props, null, 4));

    const mainCppPath = path.join(process.cwd(), 'main.cpp');
    if (!fs.existsSync(mainCppPath)) {
        const template =
`#include <iostream>
#include <windows.h>

int main() {
    SetConsoleOutputCP(CP_UTF8);
    std::cout << "🚀 PRO C++ is running!" << std::endl;
    return 0;
}`;
        fs.writeFileSync(mainCppPath, template);
    }
    console.log(`${colors.green}✅ Ready! Use 'procpp watch' to start developing.${colors.reset}`);
}

/**
 * Compiles and optionally runs the C++ project.
 * Supports both .exe and .dll targets.
 */
function buildAndRun(mode) {
    if (!checkEnv()) return;
    const isDll = mode === 'dll';
    const extension = isDll ? '.dll' : '.exe';
    
    const cppFiles = getSortedCppFiles();
    if (!cppFiles) {
        console.error(`${colors.red}❌ Error: No .cpp or .ixx files found!${colors.reset}`);
        return;
    }

    // Terminate existing process before building
    if (currentAppProcess) currentAppProcess.kill();
    
    // Perform thorough cleanup of previous build artifacts
    cleanupOldBuilds();
    
    if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR);

    const outputName = `app_build_${Date.now()}${extension}`;
    
    console.log(`\n${colors.cyan}🔨 Compiling ${isDll ? '[DLL]' : '[EXE]'}...${colors.reset}`);
    const startTime = performance.now();

    // /LD flag is used for DLL compilation
    const dllFlag = isDll ? '/LD ' : '';
    const compileCmd = `cl.exe ${dllFlag}/std:c++20 /nologo /EHsc /Zi ${cppFiles} /Fe"${outputName}"`;

    if (runSyncCommand(compileCmd)) {
        const buildTime = ((performance.now() - startTime) / 1000).toFixed(2);
        
        // Move all artifacts to the .build folder
        fs.readdirSync(process.cwd()).forEach(file => {
            const artifactExts = ['.obj', '.ifc', '.pdb', '.ilk', '.exp', '.lib'];
            if (artifactExts.some(ext => file.endsWith(ext)) || file === outputName) {
                try { fs.renameSync(path.join(process.cwd(), file), path.join(BUILD_DIR, file)); } catch(e) {}
            }
        });

        console.log(`${colors.green}${colors.bold}⚡ [Success] ${isDll ? 'Library' : 'Binary'} created in ${buildTime}s${colors.reset}`);
        
        if (isDll) {
            console.log(`${colors.yellow}📦 DLL READY -> .\\.build\\${outputName}${colors.reset}`);
            console.log(`${colors.gray}Integrate it into your .NET project using P/Invoke!${colors.reset}\n`);
        } else {
            console.log(`${colors.yellow}🟢 RUNNING -> ${outputName}${colors.reset}\n${colors.gray}${"-".repeat(40)}${colors.reset}`);
            currentAppProcess = spawn(`.\\.build\\${outputName}`, [], { shell: true, stdio: 'inherit' });
            currentAppProcess.on('close', (code) => {
                if (code !== null) console.log(`${colors.gray}${"-".repeat(40)}${colors.reset}\n${colors.red}🛑 Process exited (code ${code})${colors.reset}`);
            });
        }
    } else {
        console.log(`\n${colors.red}${colors.bold}❌ BUILD FAILED${colors.reset}`);
    }
}

/**
 * Starts a file watcher to automatically recompile on changes.
 */
function watchProject(mode) {
    if (!checkEnv()) return;
    console.clear();
    console.log(`${colors.cyan}${colors.bold}👀 PRO C++ ${mode === 'dll' ? '[DLL]' : '[EXE]'} Watcher Started${colors.reset}`);
    buildAndRun(mode);

    fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        const allowedExts = ['.cpp', '.ixx', '.h', '.hpp'];
        if (filename && allowedExts.some(ext => filename.endsWith(ext)) && !filename.includes('.build')) {
            clearTimeout(watchTimeout);
            watchTimeout = setTimeout(() => {
                console.clear();
                console.log(`${colors.gray}[${new Date().toLocaleTimeString()}] Change detected: ${filename}${colors.reset}`);
                buildAndRun(mode);
            }, 300);
        }
    });
}

// --- CLI ROUTER ---

const versionFlags = ['-v', '--version', 'version'];
if (versionFlags.includes(command)) {
    console.log(`${colors.bold}pro-cpp-cli-core v${packageJson.version}${colors.reset}`);
    process.exit(0);
}

switch (command) {
    case 'init': 
        initProject(); 
        break;
    case 'run': 
        buildAndRun(targetMode); 
        break;
    case 'watch': 
        watchProject(targetMode); 
        break;
    default:
        console.log(`${colors.bold}🛠️ PRO CPP CLI v${packageJson.version}${colors.reset}`);
        console.log(`Usage: procpp <init|run|watch|version> [dll]`);
        break;
}