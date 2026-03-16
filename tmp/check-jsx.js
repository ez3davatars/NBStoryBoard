const ts = require('typescript');
const fs = require('fs');
const file = 'src/renderer/components/SceneCanvas.tsx';
const code = fs.readFileSync(file, 'utf8');
const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

// Get syntax diagnostics specifically
const diagnostics = sourceFile.parseDiagnostics;

if (diagnostics && diagnostics.length > 0) {
    diagnostics.forEach(diag => {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(diag.start);
        console.log(`TS AST Error at line ${line + 1}, col ${character + 1}: ${diag.messageText}`);
    });
} else {
    console.log('No parse diagnostics found by TS AST check.');
}
