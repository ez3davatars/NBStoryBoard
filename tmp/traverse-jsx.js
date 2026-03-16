const ts = require('typescript');
const fs = require('fs');

const file = 'src/renderer/components/SceneCanvas.tsx';
const code = fs.readFileSync(file, 'utf8');

const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

let openTags = [];
let errorFound = false;

function traverse(node) {
    if (errorFound) return;

    if (node.kind === ts.SyntaxKind.JsxOpeningElement) {
        openTags.push({
            name: node.tagName.getText(),
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
        });
    }

    if (node.kind === ts.SyntaxKind.JsxClosingElement) {
        const closingName = node.tagName.getText();
        const lastOpen = openTags.pop();
        
        if (!lastOpen || lastOpen.name !== closingName) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            console.log(`MISMATCH DETECTED: Found </${closingName}> at line ${line}, but expected to close <${lastOpen ? lastOpen.name : 'NONE'}> from line ${lastOpen ? lastOpen.line : '?'}`);
            errorFound = true;
            return;
        }
    }

    ts.forEachChild(node, traverse);
}

traverse(sourceFile);

if (!errorFound) {
    if (openTags.length > 0) {
        console.log('UNCLOSED TAGS REMAINING AT END OF FILE:');
        openTags.forEach(t => console.log(`- <${t.name}> opened at line ${t.line}`));
    } else {
        console.log('JSX Tree appears perfectly balanced!');
    }
}
