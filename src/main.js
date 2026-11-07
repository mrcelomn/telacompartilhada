const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
let win, helper;

app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1280, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
});

ipcMain.handle('fontes', async () =>
  (await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 } }))
    .map(s => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() })));

// Inicia captura de áudio SÓ do processo dono da janela escolhida
const exe = () => app.isPackaged ? path.join(process.resourcesPath, 'audio-app.exe') : path.join(__dirname, '..', 'native', 'audio-app.exe');

// Programas que estão usando áudio agora
ipcMain.handle('apps-audio', () => new Promise(res => {
  if (process.platform !== 'win32') return res([]);
  execFile(exe(), ['list'], { encoding: 'utf8' }, (err, out) => res(String(out || '').split(/\r?\n/).filter(Boolean)
    .map(l => l.split('\t')).filter(([pid, nome]) => nome && !/^(TelaCompartilhada|Discord)/i.test(nome) && Number(pid) !== process.pid)
    .map(([pid, nome]) => ({ pid, nome }))));
}));

// audioPid: '' = automático (programa da janela), senão PID escolhido
ipcMain.handle('audio-iniciar', (e, sourceId, audioPid) => {
  pararHelper();
  if (process.platform !== 'win32') return false;
  let arg;
  if (audioPid) arg = 'pid:' + audioPid;
  else { const m = /^window:(\d+):/.exec(sourceId); if (!m) return false; arg = m[1]; }
  helper = spawn(exe(), [arg]);
  let resto = Buffer.alloc(0);
  helper.stdout.on('data', d => {
    const b = Buffer.concat([resto, d]);
    const n = b.length - (b.length % 4);          // só frames inteiros (16-bit estéreo)
    resto = b.subarray(n);
    if (n && win && !win.isDestroyed()) win.webContents.send('audio-dados', b.subarray(0, n));
  });
  helper.stderr.on('data', d => console.error(String(d)));
  helper.on('exit', c => { if (win && !win.isDestroyed()) win.webContents.send('audio-fim', c); });
  return true;
});
ipcMain.handle('audio-parar', pararHelper);
function pararHelper() { if (helper) { helper.kill(); helper = null; } }
app.on('window-all-closed', () => { pararHelper(); app.quit(); });
