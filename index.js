#!/usr/bin/env node
/**
 * PRO C++ CLI Core (V1.1.0)
 * - Added DLL compilation target (.NET 10+ compatible)
 * - Enforced x64 architecture checks and linker flags
 * - Added static runtime linking (/MT) to prevent DllNotFoundException (0x8007007E)
 * - Added aggressive cleanup for intermediate files (.obj, .pdb, .ilk, .exp, .lib)
 * - Environment Check (cl.exe validation for x64)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const packageJson = require('./package.json');

const [,, command, target] = process.argv;
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
    bold: "\x1b[1m",
    magenta: "\x1b[35m"
};

// --- UTILS ---

function checkEnv() {
    try {
        const output = execSync('cl.exe 2>&1', { encoding: 'utf8', stdio: 'pipe' });
        
        // Strict check for x64 architecture to avoid LNK1112 and .NET load errors
        if (!output.includes('x64')) {
            console.log(`\n${colors.yellow}${colors.bold}⚠️ WARNING: Compiler does not seem to be x64!${colors.reset}`);
            console.log(`${colors.gray}For .NET 10 compatibility, ensure You are using "x64 Native Tools Command Prompt for VS".${colors.reset}\n`);
        }
        return true;
    } catch (e) {
        console.error(`\n${colors.red}${colors.bold}❌ MSVC Compiler (cl.exe) NOT FOUND!${colors.reset}`);
        console.log(`${colors.yellow}💡 Fix: Please use "x64 Native Tools Command Prompt for VS 2022".${colors.reset}\n`);
        return false;
    }
}

function runSyncCommand(cmd) {
    try {
        execSync(cmd, { stdio: 'inherit' });
        return true;
    } catch (error) {
        return false;
    }
}

function cleanupOldBuilds() {
    if (fs.existsSync(BUILD_DIR)) {
        const files = fs.readdirSync(BUILD_DIR);
        files.forEach(file => {
            if (['.obj', '.pdb', '.ilk', '.ifc', '.exp', '.lib', '.dll', '.exe'].some(ext => file.endsWith(ext)) || file.startsWith('app_build')) {
                try { fs.unlinkSync(path.join(BUILD_DIR, file)); } catch (err) {}
            }
        });
    }
}

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
            "name": "Win64",
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
        // C++ Template includes an example for DLL export to help with .NET integration
        const template = 
`#include <iostream>
#include <windows.h>

// Example of a function exported for .NET 10+ (P/Invoke)
extern "C" __declspec(dllexport) int AddNumbers(int a, int b) {
    return a + b;
}

int main() {
    SetConsoleOutputCP(CP_UTF8);
    std::cout << "🚀 PRO C++ is running!" << std::endl;
    return 0;
}`;
        fs.writeFileSync(mainCppPath, template);
    }

    console.log(`${colors.green}✅ Ready! Use 'procpp watch' for EXE or 'procpp watch dll' for Libraries.${colors.reset}`);
}

function buildAndRun(buildTarget) {
    if (!checkEnv()) return;

    const cppFiles = getSortedCppFiles();
    if (!cppFiles) {
        console.error(`${colors.red}❌ Error: No .cpp or .ixx files found!${colors.reset}`);
        return;
    }

    if (currentAppProcess) {
        currentAppProcess.kill();
        currentAppProcess = null;
    }

    cleanupOldBuilds();
    if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR);

    const isDll = buildTarget === 'dll';
    const ext = isDll ? '.dll' : '.exe';
    const outputFileName = `app_build_${Date.now()}${ext}`;

    console.log(`\n${colors.cyan}🔨 Compiling ${isDll ? 'DLL Library' : 'Executable'} (x64)...${colors.reset}`);
    const startTime = performance.now();

    // /MT statically links the runtime to prevent 0x8007007E DllNotFoundException on servers
    // /LD compiles as DLL
    // /link /MACHINE:X64 forces 64-bit linking
    let compileCmd = `cl.exe /std:c++20 /nologo /EHsc /Zi ${cppFiles} /Fe"${outputFileName}"`;
    
    if (isDll) {
        compileCmd = `cl.exe /std:c++20 /nologo /EHsc /Zi /MT /LD ${cppFiles} /Fe"${outputFileName}" /link /MACHINE:X64`;
    }

    if (runSyncCommand(compileCmd)) {
        const buildTime = ((performance.now() - startTime) / 1000).toFixed(2);
        
        // Handle artifacts
        const junkExtensions = ['.obj', '.ifc', '.pdb', '.ilk', '.exp', '.lib'];
        fs.readdirSync(process.cwd()).forEach(file => {
            const isOutput = file === outputFileName;
            const isJunk = junkExtensions.some(e => file.endsWith(e));

            if (isOutput) {
                // Move the main artifact (.exe or .dll) to .build directory
                try { fs.renameSync(path.join(process.cwd(), file), path.join(BUILD_DIR, file)); } catch(e) {}
            } else if (isJunk) {
                if (isDll) {
                    // Aggressive cleanup for DLL builds: wipe out all junk files to keep it clean
                    try { fs.unlinkSync(path.join(process.cwd(), file)); } catch(e) {}
                } else {
                    // Move junk to .build for EXE (useful for debugging)
                    try { fs.renameSync(path.join(process.cwd(), file), path.join(BUILD_DIR, file)); } catch(e) {}
                }
            }
        });

        console.log(`${colors.green}${colors.bold}⚡ [Success] Compiled ${outputFileName} in ${buildTime}s${colors.reset}`);

        if (isDll) {
            console.log(`${colors.magenta}📦 DLL is ready in .build/ for .NET 10 integration.${colors.reset}\n + ${colors.gray}${"-".repeat(40)}${colors.reset}`);
        } else {
            console.log(`${colors.yellow}🟢 RUNNING -> ${outputFileName}${colors.reset}\n + ${colors.gray}${"-".repeat(40)}${colors.reset}`);
            currentAppProcess = spawn(`.\\.build\\${outputFileName}`, [], { shell: true, stdio: 'inherit' });
            
            currentAppProcess.on('close', (code) => {
                if (code !== null) console.log(`${colors.gray}${"-".repeat(40)}${colors.reset}\n${colors.red}🛑 Process exited (code ${code})${colors.reset}`);
            });
        }
    } else {
        console.log(`\n${colors.red}${colors.bold}❌ BUILD FAILED${colors.reset}`);
    }
}

function watchProject(buildTarget) {
    if (!checkEnv()) return;
    console.clear();
    console.log(`${colors.cyan}${colors.bold}👀 PRO C++ Watcher Started (${buildTarget === 'dll' ? 'DLL Mode' : 'EXE Mode'})${colors.reset}`);
    
    buildAndRun(buildTarget);

    fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.cpp') || filename.endsWith('.ixx') || filename.endsWith('.h')) && !filename.includes('.build')) {
            clearTimeout(watchTimeout);
            watchTimeout = setTimeout(() => {
                console.clear();
                console.log(`${colors.gray}[${new Date().toLocaleTimeString()}] Change detected: ${filename}${colors.reset}`);
                buildAndRun(buildTarget);
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
        buildAndRun(target); 
        break;
    case 'watch': 
        watchProject(target); 
        break;
    default: 
        console.log(`${colors.bold}🛠️ PRO CPP CLI v${packageJson.version}${colors.reset}`);
        console.log(`Usage: procpp <init|run|watch|version> [dll]`); 
        break;
}