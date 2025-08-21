const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
const CONTENT = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

// ตรวจว่า URL ปัจจุบันเป็นโดเมน SGS ไหม
function isSgsUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return /\.bopp-obec\.info$/i.test(u.hostname) || /bopp-obec\.info$/i.test(u.hostname);
  } catch { return false; }
}

function createWindow () {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // ปลอดภัย: ไม่เปิด nodeIntegration ในหน้าเว็บ
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // โหลดหน้า SGS (หรือจะให้ผู้ใช้พิมพ์ URL เองก็ได้)
  win.loadURL('https://sgs.bopp-obec.info/');

  // inject เมื่อโหลดเสร็จ
  const inject = () => {
    const url = win.webContents.getURL();
    if (isSgsUrl(url)) {
      const code = `
        try { (function(){ ${CONTENT} })(); }
        catch(e){ console.error('SGS Helper inject error:', e); }
      `;
      win.webContents.executeJavaScript(code).catch(console.error);
    }
  };

  win.webContents.on('did-finish-load', inject);
  win.webContents.on('dom-ready', inject);
  win.webContents.on('did-navigate', inject);
  win.webContents.on('did-navigate-in-page', inject);

  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });
