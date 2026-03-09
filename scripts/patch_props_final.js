const fs = require('fs');
const path = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/PropAccessoryStudio.tsx';

let content = fs.readFileSync(path, 'utf8');

// Find the start of the function definition
const sIdx = content.indexOf('  const executeDelete = async () => {');
if (sIdx !== -1) {
    // Find the end of the block
    const eIdx = content.indexOf('const newItems = state.propItems.filter(p => p.id !== item.id);', sIdx);

    if (eIdx !== -1) {
        // Construct the payload text manually 
        const payloadStr = '  const executeDelete = async () => {\n' +
            '    if (!confirmDelete) return;\n' +
            '    const item = confirmDelete;\n\n' +
            '    try {\n' +
            '      let deleted = false;\n' +
            '      if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\n' +
            '        try {\n' +
            '          const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, \'props\', item.id);\n' +
            '          deleted = await window.electronAPI.deleteFile(filePath);\n' +
            '        } catch (e) { console.warn("IPC delete failed", e); }\n' +
            '      }\n' +
            '      if (!deleted && state.saveDirectoryHandle) {\n' +
            '        try {\n' +
            '          const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\n' +
            '          await propsHandle.removeEntry(item.id);\n' +
            '        } catch (e) { console.warn("Disk delete failed or not found", e); }\n' +
            '      }\n\n' +
            '    // Update State\n' +
            '    ';

        const newContent = content.substring(0, sIdx) + payloadStr + content.substring(eIdx);
        fs.writeFileSync(path, newContent, 'utf8');
        console.log('Props patched via absolute index framing.');
    } else {
        console.log('End index missing');
    }
} else {
    console.log('Start index missing');
}
