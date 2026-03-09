const fs = require('fs');

function replaceStr(filePath, searchStr, replaceStr) {
    let content = fs.readFileSync(filePath, 'utf8');
    const normalizedContent = content.replace(/\s+/g, ' ');
    const normalizedSearch = searchStr.replace(/\s+/g, ' ');

    if (normalizedContent.includes(normalizedSearch)) {
        const regexStr = searchStr.replace(/\s+/g, '\\s+').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(regexStr.replace(/\\s\+/g, '\\s+'), 'g');

        let newContent = content.replace(regex, replaceStr);

        if (newContent !== content) {
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log('Updated filePath: ' + filePath);
        } else {
            console.log('Regex match failed on ' + filePath);
        }
    } else {
        console.log('Failed to find block in ' + filePath);
    }
}

// -----------------------------------------
// WARDROBE
// -----------------------------------------
const wPath = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/WardrobeStudio.tsx';
const wSearch = `    if (state.saveDirectoryHandle) {
      try {
        const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
        await wardrobeHandle.removeEntry(item.id);
      } catch (e) { console.warn("Disk delete failed or not found", e); }
    }`;

const wReplace = `    let deleted = false;
    if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {
      try {
        const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'wardrobe', item.id);
        deleted = await window.electronAPI.deleteFile(filePath);
      } catch (e) { console.warn("IPC delete failed", e); }
    }
    if (!deleted && state.saveDirectoryHandle) {
      try {
        const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
        await wardrobeHandle.removeEntry(item.id);
      } catch (e) { console.warn("Disk delete failed or not found", e); }
    }`;

replaceStr(wPath, wSearch, wReplace);

// -----------------------------------------
// NANO CASTING DIRECTOR
// -----------------------------------------
const nPath = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/NanoCastingDirector.tsx';
replaceStr(nPath, wSearch, wReplace);

// -----------------------------------------
// PROPS
// -----------------------------------------
const pPath = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/PropAccessoryStudio.tsx';
const pSearch = `    if (state.saveDirectoryHandle) {
      try {
        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });
        await propsHandle.removeEntry(item.id);
      } catch (e) { console.warn("Disk delete failed or not found", e); }
    }`;

const pReplace = `    let deleted = false;
    if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {
      try {
        const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'props', item.id);
        deleted = await window.electronAPI.deleteFile(filePath);
      } catch (e) { console.warn("IPC delete failed", e); }
    }
    if (!deleted && state.saveDirectoryHandle) {
      try {
        const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });
        await propsHandle.removeEntry(item.id);
      } catch (e) { console.warn("Disk delete failed or not found", e); }
    }`;

replaceStr(pPath, pSearch, pReplace);


// -----------------------------------------
// CASTING FORGE
// -----------------------------------------
const cPath = 'd:/NanobananaProStudio/NBStoryBoard/src/renderer/components/CastingForge.tsx';
const cSearch = `      if (actor && actor.filename && state.saveDirectoryHandle) {
        try {
          // Verify Write Permission before attempting delete
          const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
          if (!hasPermission) {
            showToast("Permission Denied: Cannot delete file from disk.");
            return; // Abort delete
          }

          const dir = await state.saveDirectoryHandle.getDirectoryHandle('Actors');
          await dir.removeEntry(actor.filename);
          dispatch({ type: 'ADD_LOG', payload: { message: "File deleted from disk", type: 'success' } });

          // Only remove from memory if disk delete succeeded
          dispatch({ type: 'REMOVE_ACTOR_LIBRARY', payload: actorId });
          dispatch({ type: 'ADD_LOG', payload: { message: "Actor permanently removed", type: 'info' } });

        } catch (e: any) {
          console.error("Disk delete failed", e);
          showToast(\`Delete Error: \${e.message}\`);
          setDeleteTarget(null);
          return;
        }
      }`;

const cReplace = `      if (actor && actor.filename) {
        let fileDeleted = false;
        
        if (state.saveDirectoryPath && window.electronAPI && window.electronAPI.deleteFile && window.electronAPI.joinPath) {
          try {
            const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors', actor.filename);
            fileDeleted = await window.electronAPI.deleteFile(filePath);
          } catch (e) { console.warn("IPC delete failed", e); }
        }
        
        if (!fileDeleted && state.saveDirectoryHandle) {
          try {
            const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
            if (!hasPermission) {
              showToast("Permission Denied: Cannot delete file from disk.");
              return;
            }
            const dir = await state.saveDirectoryHandle.getDirectoryHandle('Actors');
            await dir.removeEntry(actor.filename);
            fileDeleted = true;
          } catch (e: any) {
            console.error("Disk delete failed", e);
            showToast(\`Delete Error: \${e.message}\`);
            setDeleteTarget(null);
            return;
          }
        }

        if (fileDeleted) {
          dispatch({ type: 'ADD_LOG', payload: { message: "File deleted from disk", type: 'success' } });
          dispatch({ type: 'REMOVE_ACTOR_LIBRARY', payload: actorId });
          dispatch({ type: 'ADD_LOG', payload: { message: "Actor permanently removed", type: 'info' } });
        }
      }`;

replaceStr(cPath, cSearch, cReplace);

console.log('Update Script Complete.');
