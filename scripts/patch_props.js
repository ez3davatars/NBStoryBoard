const fs = require('fs');
const path = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/PropAccessoryStudio.tsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    const startAnchor = '  const executeDelete = async () => {\r\n    if (!confirmDelete) return;\r\n    const item = confirmDelete;\r\n\r\n    try {\r\n';
    const endAnchor = '\r\n    // Update State\r\n';

    let sIdx = content.indexOf(startAnchor);
    if (sIdx !== -1) {
        let eIdx = content.indexOf(endAnchor, sIdx);
        if (eIdx !== -1) {
            const inject = '      let deleted = false;\r\n      if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\r\n        try {\r\n          const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, \'props\', item.id);\r\n          deleted = await window.electronAPI.deleteFile(filePath);\r\n        } catch (e) { console.warn("IPC delete failed", e); }\r\n      }\r\n      if (!deleted && state.saveDirectoryHandle) {\r\n        try {\r\n          const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\r\n          await propsHandle.removeEntry(item.id);\r\n        } catch (e) { console.warn("Disk delete failed or not found", e); }\r\n      }';

            const newContent = content.substring(0, sIdx + startAnchor.length) + inject + content.substring(eIdx);
            fs.writeFileSync(path, newContent, 'utf8');
            console.log('Props patched (CRLF).');
        }
    } else {
        // Fallback LF
        const startAnchorLF = '  const executeDelete = async () => {\n    if (!confirmDelete) return;\n    const item = confirmDelete;\n\n    try {\n';
        const endAnchorLF = '\n    // Update State\n';
        let sIdxLF = content.indexOf(startAnchorLF);
        if (sIdxLF !== -1) {
            let eIdxLF = content.indexOf(endAnchorLF, sIdxLF);
            if (eIdxLF !== -1) {
                const injectLF = '      let deleted = false;\n      if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\n        try {\n          const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, \'props\', item.id);\n          deleted = await window.electronAPI.deleteFile(filePath);\n        } catch (e) { console.warn("IPC delete failed", e); }\n      }\n      if (!deleted && state.saveDirectoryHandle) {\n        try {\n          const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\n          await propsHandle.removeEntry(item.id);\n        } catch (e) { console.warn("Disk delete failed or not found", e); }\n      }';
                const newContentLF = content.substring(0, sIdxLF + startAnchorLF.length) + injectLF + content.substring(eIdxLF);
                fs.writeFileSync(path, newContentLF, 'utf8');
                console.log('Props patched (LF).');
            }
        } else {
            console.log('Could not find Props anchors.');
        }
    }
} catch (e) {
    console.error(e);
}
