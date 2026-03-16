const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDir = path.join(__dirname, 'public', 'assets', 'imgly');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// Map from the keys @imgly expects, to the local file names we will save them as
const filesToLink = {
    '/onnxruntime-web/ort-wasm-simd-threaded.wasm': 'ort-wasm-simd-threaded.wasm',
    '/onnxruntime-web/ort-wasm-simd-threaded.mjs': 'ort-wasm-simd-threaded.mjs',
    '/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm': 'ort-wasm-simd-threaded.jsep.wasm',
    '/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs': 'ort-wasm-simd-threaded.jsep.mjs',
    '/onnxruntime-web/ort-wasm-simd.wasm': 'ort-wasm-simd.wasm',
    '/onnxruntime-web/ort-wasm-simd.mjs': 'ort-wasm-simd.mjs',
    '/onnxruntime-web/ort-wasm-threaded.wasm': 'ort-wasm-threaded.wasm',
    '/onnxruntime-web/ort-wasm-threaded.mjs': 'ort-wasm-threaded.mjs',
    '/onnxruntime-web/ort-wasm.wasm': 'ort-wasm.wasm',
    '/onnxruntime-web/ort-wasm.mjs': 'ort-wasm.mjs',
};

const ortLocalPath = path.join(__dirname, 'node_modules', 'onnxruntime-web', 'dist');

const resources = {};

function addResource(key, size, filename) {
    resources[key] = {
        size: size,
        mime: filename.endsWith('.wasm') ? 'application/wasm' :
              filename.endsWith('.mjs') ? 'text/javascript' :
              'application/octet-stream',
        chunks: [
            {
                offsets: [0, size],
                name: filename
            }
        ]
    };
}

// 1. Copy ORT files from node_modules
for (const [key, filename] of Object.entries(filesToLink)) {
    const src = path.join(ortLocalPath, filename);
    const dest = path.join(targetDir, filename);
    
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        const stats = fs.statSync(dest);
        addResource(key, stats.size, filename);
        console.log(`Copied and mapped ${filename} (${stats.size} bytes)`);
    } else {
        console.warn(`WARNING: Missing local ORT module file: ${src}`);
        // Imgly expects the keys to exist, even if fake, so we create empty files if absent to satisfy JSON schema (though it might fail later if requested)
    }
}

// 2. Download isnet_fp16 from Github LFS Media directly
const isnetUrl = "https://media.githubusercontent.com/media/imgly/background-removal-js/main/bundle/models/isnet_fp16";
const isnetDest = path.join(targetDir, 'isnet_fp16.onnx');

console.log("Downloading isnet_fp16 from GitHub LFS...");

const request = https.get(isnetUrl, (response) => {
    if (response.statusCode === 200) {
        const fileWriter = fs.createWriteStream(isnetDest);
        response.pipe(fileWriter);
        
        fileWriter.on('finish', () => {
            fileWriter.close();
            const stats = fs.statSync(isnetDest);
            console.log(`Downloaded isnet_fp16.onnx (${stats.size} bytes)`);
            
            // Map the model key precisely as @imgly expects
            addResource('/models/isnet_fp16', stats.size, 'isnet_fp16.onnx');
            
            // Write the generated resources.json
            const jsonDest = path.join(targetDir, 'resources.json');
            fs.writeFileSync(jsonDest, JSON.stringify(resources, null, 2));
            console.log("SUCCESS! Synthetic resources.json generated fully offline!");
        });
    } else {
        console.error(`Failed to download isnet_fp16. HTTP Status: ${response.statusCode}`);
    }
}).on('error', (err) => {
    console.error(`Download Error: ${err.message}`);
});
