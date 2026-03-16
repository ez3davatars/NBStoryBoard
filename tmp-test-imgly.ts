import { removeBackground, Config } from '@imgly/background-removal';
import fs from 'fs';
import path from 'path';

async function testImgly() {
    console.log("[TestImgly] Starting...");
    try {
        console.log("[TestImgly] Loading a small dummy image buffer to satisfy generic blob requirement...");
        // A tiny 1x1 transparent PNG payload to act as a Blob
        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        const blob = new Blob([tinyPng], { type: 'image/png' });

        console.log("[TestImgly] Calling removeBackground with default config (checking remote fetch)...");
        // We will output progress to see where it hangs or fails
        const config: Config = {
            progress: (key: string, current: number, total: number) => {
                console.log(`[Progress] ${key}: ${current}/${total}`);
            }
        };

        const result = await removeBackground(blob, config);
        console.log("[TestImgly] Success!", result.size, "bytes output");
    } catch (e: any) {
        console.error("\n[TestImgly] THROWN ERROR:");
        console.error(e.message || e);
        if (e.cause) console.error("Cause:", e.cause);
        process.exit(1);
    }
}

testImgly();
