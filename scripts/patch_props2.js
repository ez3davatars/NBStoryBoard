const fs = require('fs');
const path = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/PropAccessoryStudio.tsx';

let content = fs.readFileSync(path, 'utf8');

const sIdx = content.indexOf('  const executeDelete = async () => {');
const eIdx = content.indexOf('  // Update State');

if (sIdx !== -1 && eIdx !== -1) {
    const inject = "  const executeDelete = async () => {\r\n" +
        "    if (!confirmDelete) return;\r\n" +
        "    const item = confirmDelete;\r\n" +
        "\r\n" +
        "    try {\r\n" +
        "      let deleted = false;\r\n" +
        "      if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {\r\n" +
        "        try {\r\n" +
        "          const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'props', item.id);\r\n" +
        "          deleted = await window.electronAPI.deleteFile(filePath);\r\n" +
        "        } catch (e) {\r\n" +
        "          console.warn(\"IPC delete failed\", e);\r\n" +
        "        }\r\n" +
        "      }\r\n" +
        "      \r\n" +
        "      if (!deleted && state.saveDirectoryHandle) {\r\n" +
        "        try {\r\n" +
        "          const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });\r\n" +
        "          await propsHandle.removeEntry(item.id);\r\n" +
        "        } catch (e) { console.warn(\"Disk delete failed or not found\", e); }\r\n" +
        "      }\r\n\r\n  ";

    const newContent = content.substring(0, sIdx) + inject + content.substring(eIdx);
    fs.writeFileSync(path, newContent, 'utf8');
    console.log('Successfully patched PropAccessoryStudio.tsx');
} else {
    console.log('Failed to patch PropAccessoryStudio.');
}
