#!/usr/bin/env node

/**
 * PRO C++ CLI Core (V1.2.1)
 * - Added robust argument parsing for Release mode (-r, -release, --release)
 * - Added Release Mode for hardcore hardware optimization
 * - Added SIMD Vectorization (/arch:AVX2) and Fast Math (/fp:fast) for AI/Math tasks
 * - Added comprehensive Help Menu (-h, --help) like dotnet CLI
 * - Added Dynamic DLL Naming with Readline prompt
 * - Persistent name caching during watch mode
 * - Added DLL compilation target (.NET 10+ compatible)
 * - Enforced x64 architecture checks and linker flags
 * - Added static runtime linking (/MT) to prevent DllNotFoundException (0x8007007E)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const readline = require('readline');
const packageJson = require('./package.json');

// --- ARGUMENT PARSING (ROBUST PRO-LEVEL) ---
const releaseFlags = ['--release', '-release', '-r'];
const isRelease = process.argv.some(arg => releaseFlags.includes(arg.toLowerCase()));

// Clean up args to extract command and targets cleanly (removes any release flags)
const cleanArgs = process.argv.slice(2).filter(a => !releaseFlags.includes(a.toLowerCase()));
const command = cleanArgs[0];
const target = cleanArgs[1];
const optionalName = cleanArgs[2];

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

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function getDynamicDllName() {
    if (optionalName) {
        const name = optionalName.trim();
        return name.toLowerCase().endsWith('.dll') ? name : `${name}.dll`;
    }

    console.log(`\n${colors.cyan}${colors.bold}🧠 PRO C++ DLL Configuration${colors.reset}`);
    const answer = await askQuestion(`${colors.yellow}Enter the desired name for your DLL (e.g., CoreEngine): ${colors.reset}`);
    
    const name = answer.trim() || 'ProLibrary'; 
    return name.toLowerCase().endsWith('.dll') ? name : `${name}.dll`;
}

function checkEnv() {
    try {
        const output = execSync('cl.exe 2>&1', { encoding: 'utf8', stdio: 'pipe' });
        
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
        const template = 
`#include <iostream>
#include <windows.h>

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

    console.log(`${colors.green}✅ Ready! Use 'procpp -h' for help.${colors.reset}`);
}

function buildAndRun(buildTarget, customDllName = null) {
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
    
    const outputFileName = isDll ? customDllName : `app_build_${Date.now()}${ext}`;
    
    const modeText = isRelease ? `${colors.magenta}RELEASE (Hardware Optimized)${colors.cyan}` : `DEBUG`;
    console.log(`\n${colors.cyan}🔨 Compiling ${isDll ? 'DLL Library' : 'Executable'} (x64) [${modeText}]...${colors.reset}`);
    
    const startTime = performance.now();

    // Base flags
    let compileCmd = `cl.exe /std:c++20 /nologo /EHsc ${cppFiles} /Fe"${outputFileName}"`;
    
    // Optimization Flags
    if (isRelease) {
        compileCmd += ` /O2 /fp:fast /arch:AVX2`;
    } else {
        compileCmd += ` /Zi`; 
    }

    // DLL specific flags
    if (isDll) {
        compileCmd += ` /MT /LD /link /MACHINE:X64`;
    }

    if (runSyncCommand(compileCmd)) {
        const buildTime = ((performance.now() - startTime) / 1000).toFixed(2);
        
        const junkExtensions = ['.obj', '.ifc', '.pdb', '.ilk', '.exp', '.lib'];
        fs.readdirSync(process.cwd()).forEach(file => {
            const isOutput = file === outputFileName;
            const isJunk = junkExtensions.some(e => file.endsWith(e));

            if (isOutput) {
                try { fs.renameSync(path.join(process.cwd(), file), path.join(BUILD_DIR, file)); } catch(e) {}
            } else if (isJunk) {
                if (isDll || isRelease) {
                    try { fs.unlinkSync(path.join(process.cwd(), file)); } catch(e) {}
                } else {
                    try { fs.renameSync(path.join(process.cwd(), file), path.join(BUILD_DIR, file)); } catch(e) {}
                }
            }
        });

        console.log(`${colors.green}${colors.bold}⚡ [Success] Compiled ${outputFileName} in ${buildTime}s${colors.reset}`);

        if (isDll) {
            console.log(`${colors.magenta}📦 DLL [${outputFileName}] is ready in .build/ for .NET integration.${colors.reset}\n + ${colors.gray}${"-".repeat(40)}${colors.reset}`);
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

async function watchProject(buildTarget) {
    if (!checkEnv()) return;
    console.clear();
    
    let dllName = null;
    if (buildTarget === 'dll') {
        dllName = await getDynamicDllName();
    }

    const modeText = isRelease ? '(RELEASE MODE)' : '';
    console.log(`${colors.cyan}${colors.bold}👀 PRO C++ Watcher Started (${buildTarget === 'dll' ? `DLL Mode: ${dllName}` : 'EXE Mode'}) ${colors.magenta}${modeText}${colors.reset}`);
    
    buildAndRun(buildTarget, dllName);

    fs.watch(process.cwd(), { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.cpp') || filename.endsWith('.ixx') || filename.endsWith('.h')) && !filename.includes('.build')) {
            clearTimeout(watchTimeout);
            watchTimeout = setTimeout(() => {
                console.clear();
                console.log(`${colors.gray}[${new Date().toLocaleTimeString()}] Change detected: ${filename}${colors.reset}`);
                buildAndRun(buildTarget, dllName);
            }, 300);
        }
    });
}

// --- HELP MENU ---
function showHelp() {
    console.log(`\n${colors.cyan}${colors.bold}🛠️  PRO C++ CLI Core v${packageJson.version}${colors.reset}`);
    console.log(`${colors.gray}The ultimate C++ build tool tailored for .NET 10+ integration.${colors.reset}\n`);
    
    console.log(`${colors.yellow}Usage:${colors.reset}`);
    console.log(`  procpp <command> [target] [DllName] [flags]\n`);
    
    console.log(`${colors.yellow}Commands:${colors.reset}`);
    console.log(`  ${colors.green}init${colors.reset}      Initializes a new PRO C++ project`);
    console.log(`  ${colors.green}run${colors.reset}       Compiles the project once (EXE or DLL)`);
    console.log(`  ${colors.green}watch${colors.reset}     Starts the watcher, auto-recompiling on file changes\n`);

    console.log(`${colors.yellow}Targets & Arguments:${colors.reset}`);
    console.log(`  ${colors.cyan}dll${colors.reset}       Compiles the project as a Dynamic Link Library (.dll)`);
    console.log(`  ${colors.cyan}[DllName]${colors.reset} (Optional) Fast-track dynamic DLL naming\n`);

    console.log(`${colors.yellow}PRO Flags:${colors.reset}`);
    console.log(`  ${colors.magenta}-r, --release${colors.reset} Compiles with /O2, /fp:fast, and /arch:AVX2 for MAX hardware speed!`);
    console.log(`  ${colors.magenta}-h, --help${colors.reset}    Show this help message`);
    console.log(`  ${colors.magenta}-v, --version${colors.reset} Show CLI version\n`);

    console.log(`${colors.yellow}Examples:${colors.reset}`);
    console.log(`  ${colors.gray}procpp watch${colors.reset}                 ${colors.gray}// Standard debug watch${colors.reset}`);
    console.log(`  ${colors.gray}procpp watch dll MediaCore${colors.reset}   ${colors.gray}// Debug DLL watch${colors.reset}`);
    console.log(`  ${colors.gray}procpp run --release${colors.reset}         ${colors.gray}// Build EXE with SIMD optimizations!${colors.reset}`);
    console.log(`  ${colors.gray}procpp run dll --release${colors.reset}     ${colors.gray}// Build PRODUCTION-READY DLL!${colors.reset}\n`);
}

// --- CLI ROUTER ---

const versionFlags = ['-v', '--version', 'version'];
const helpFlags = ['-h', '--help', 'help'];

if (versionFlags.includes(command)) {
    console.log(`${colors.bold}pro-cpp-cli-core v${packageJson.version}${colors.reset}`);
    process.exit(0);
}

if (helpFlags.includes(command) || !command) {
    showHelp();
    process.exit(0);
}

(async () => {
    switch (command) {
        case 'init': 
            initProject(); 
            break;
        case 'run': 
            let runDllName = null;
            if (target === 'dll') {
                runDllName = await getDynamicDllName();
            }
            buildAndRun(target, runDllName); 
            break;
        case 'watch': 
            await watchProject(target); 
            break;
        default: 
            console.log(`\n${colors.red}❌ Unknown command: ${command}${colors.reset}`);
            showHelp();
            break;
    }
})();