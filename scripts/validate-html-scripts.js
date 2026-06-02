const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

let ok = 0;

for (const [index, code] of scripts.entries()) {
  try {
    new Function(code);
    ok += 1;
  } catch (error) {
    console.error(`script ${index + 1} syntax error: ${error.message}`);
    process.exitCode = 1;
  }
}

console.log(`scripts ok ${ok}`);
