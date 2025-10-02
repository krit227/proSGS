// preload.js
const fs = require('fs');
const path = require('path');

window.addEventListener('DOMContentLoaded', () => {
  console.log("✅ Page loaded, injecting SGS Helper");

  // inject content.js
  const contentPath = path.join(__dirname, 'content.js');
  const code = fs.readFileSync(contentPath, 'utf-8');
  const script = document.createElement('script');
  script.textContent = code;
  document.documentElement.appendChild(script);
});
