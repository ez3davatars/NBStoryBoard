const { removeBackground } = require('@imgly/background-removal');

async function testImgly() {
    console.log("[TestImgly] Starting...");
    try {
        console.log("[TestImgly] Loading a small dummy image buffer to satisfy generic blob requirement...");
        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        const blob = new Blob([tinyPng], { type: 'image/png' });

        console.log("[TestImgly] Calling removeBackground with default config (checking remote fetch)...");
        const config = {
            progress: (key, current, total) => {
                console.log(`[Progress] ${key}: ${current}/${total}`);
            }
        };

        const result = await removeBackground(blob, config);
        console.log("[TestImgly] Success!", result.size, "bytes output");
    } catch (e) {
        console.error("\n[TestImgly] THROWN ERROR:");
        console.error(e.message || e);
        if (e.cause) console.error("Cause:", e.cause);
        process.exit(1);
    }
}

testImgly();
