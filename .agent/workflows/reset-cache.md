---
description: How to fix Electron cache and quota database access errors
---

If you are seeing errors like `Unable to move the cache: Access is denied` or `Could not open the quota database`, follow these steps to reset the application's local data.

### 1. Close the Application
Ensure all instances of the application are closed. Use Task Manager to kill any stray `electron.exe` or `nano-banana-studio.exe` processes if necessary.

### 2. Clear AppData Cache
The application stores local settings and cache in your user profile. Clearing this usually resolves database and access errors.

On Windows, run the following command in PowerShell:
```powershell
Remove-Item -Recurle -Force "$env:APPDATA\nano-banana-studio"
```

### 3. Restart Dev Server
Restart the dev environment:
```bash
npm run dev
```

### Why this happens
- **File Locks**: A previous instance of the app might not have closed properly, keeping files locked.
- **Corruption**: Sudden crashes can leave the Chromium Quota Database in an inconsistent state.
- **Permissions**: Antivirus or system restrictions might temporarily block access to the `AppData` folder.
