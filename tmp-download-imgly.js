const https = require('https');
const fs = require('fs');
const { exec } = require('child_process');

const url = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/package.tgz';
const file = fs.createWriteStream('imgly_package.tgz');

console.log("Fetching: " + url);

https.get(url, (res) => {
    if (res.statusCode > 300 && res.statusCode < 400 && res.headers.location) {
        console.log("Redirected to: " + res.headers.location);
        https.get(res.headers.location, handleResponse);
    } else {
        handleResponse(res);
    }
}).on('error', err => {
    console.error("Fetch Error:", err.message);
});

function handleResponse(res) {
    console.log("Status:", res.statusCode);
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log("Download complete.");
        exec('tar -tzf imgly_package.tgz', (err, stdout, stderr) => {
            if (err) {
                console.error("Tar error:", err);
                // Windows tar might fail if not available, we just want to know if download worked
            } else {
                console.log("Tar contents:\n" + stdout);
            }
        });
    });
}
