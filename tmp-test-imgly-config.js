const { removeBackground } = require('@imgly/background-removal');

async function testImglyConfig() {
    console.log("[TestImglyConfig] Starting...");
    try {
        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        const blob = new Blob([tinyPng], { type: 'image/png' });

        const config = {
            publicPath: "http://localhost:5173/assets/imgly/",
            model: "isnet_fp16"
        };
        console.log("[TestImglyConfig] Passing config:", config);

        // We expect this to fail hitting localhost instead of staticimgly.com
        await removeBackground(blob, config);
    } catch (e) {
        console.error("\n[TestImglyConfig] THROWN ERROR:");
        console.error(e.message || e);
        if (e.cause) console.error("Cause:", e.cause);
    }
}

testImglyConfig();
