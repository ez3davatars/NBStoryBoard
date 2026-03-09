const fs = require('fs');
const path = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/PropAccessoryStudio.tsx';

let content = fs.readFileSync(path, 'utf8');

const sIdxCRLF = content.indexOf('  try {\r\n    if (state.saveDirectoryHandle) {\r\n      try {\r\n        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\r\n        await propsHandle.removeEntry(item.id);\r\n      } catch (e) { console.warn("Disk delete failed or not found", e); }\r\n    }');
const sIdxLF = content.indexOf('  try {\n    if (state.saveDirectoryHandle) {\n      try {\n        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\n        await propsHandle.removeEntry(item.id);\n      } catch (e) { console.warn("Disk delete failed or not found", e); }\n    }');

const tCRLF = '  try {\r\n    let deleted = false;\r\n    if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\r\n      try {\r\n        const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, \'props\', item.id);\r\n        deleted = await window.electronAPI.deleteFile(filePath);\r\n      } catch (e) { console.warn("IPC delete failed", e); }\r\n    }\r\n    if (!deleted && state.saveDirectoryHandle) {\r\n      try {\r\n        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\r\n        await propsHandle.removeEntry(item.id);\r\n      } catch (e) { console.warn("Disk delete failed or not found", e); }\r\n    }';

const tLF = '  try {\n    let deleted = false;\n    if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\n      try {\n        const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, \'props\', item.id);\n        deleted = await window.electronAPI.deleteFile(filePath);\n      } catch (e) { console.warn("IPC delete failed", e); }\n    }\n    if (!deleted && state.saveDirectoryHandle) {\n      try {\n        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\n        await propsHandle.removeEntry(item.id);\n      } catch (e) { console.warn("Disk delete failed or not found", e); }\n    }';

if (sIdxCRLF !== -1) {
    const newContent = content.substring(0, sIdxCRLF) + tCRLF + content.substring(sIdxCRLF + 316);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Patched via CRLF');
} else if (sIdxLF !== -1) {
    const newContent = content.substring(0, sIdxLF) + tLF + content.substring(sIdxLF + 310);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Patched via LF');
} else {
    console.log('Target string completely missed.');
}
