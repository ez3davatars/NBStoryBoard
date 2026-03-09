const fs = require('fs');
const path = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/PropAccessoryStudio.tsx';

let content = fs.readFileSync(path, 'utf8');

const sIdx = content.indexOf('    if (state.saveDirectoryHandle) {\n      try {\n        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\n        await propsHandle.removeEntry(item.id);\n      } catch (e) { console.warn("Disk delete failed or not found", e); }\n    }');
const sIdxCRLF = content.indexOf('    if (state.saveDirectoryHandle) {\r\n      try {\r\n        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle(\'props\', { create: false });\r\n        await propsHandle.removeEntry(item.id);\r\n      } catch (e) { console.warn("Disk delete failed or not found", e); }\r\n    }');

const inject = "    let deleted = false;\n" +
    "    if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\n" +
    "      try {\n" +
    "        const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'props', item.id);\n" +
    "        deleted = await window.electronAPI.deleteFile(filePath);\n" +
    "      } catch (e) { console.warn(\"IPC delete failed\", e); }\n" +
    "    }\n" +
    "    if (!deleted && state.saveDirectoryHandle) {\n" +
    "      try {\n" +
    "        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });\n" +
    "        await propsHandle.removeEntry(item.id);\n" +
    "      } catch (e) { console.warn(\"Disk delete failed or not found\", e); }\n" +
    "    }";

if (sIdx !== -1) {
    const newContent = content.substring(0, sIdx) + inject + content.substring(sIdx + 301); // len of search block = 301
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Props patched (LF)');
} else if (sIdxCRLF !== -1) {
    const newContent = content.substring(0, sIdxCRLF) + inject.replace(/\n/g, '\r\n') + content.substring(sIdxCRLF + 307); // len of crlf block = 307
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Props patched (CRLF)');
} else {
    console.log('Could not find Props target string entirely.');
}
