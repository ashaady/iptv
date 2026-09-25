const { app, BrowserWindow, Menu, shell, ipcMain, powerSaveBlocker } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

app.disableHardwareAcceleration();

// La version de développement ne doit jamais prendre le verrou ni les données
// de la version installée. Sinon un clic sur Fluxa IPTV réactive Electron dev.
if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "fluxa-iptv-dev"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

const DEV_FRONTEND_PORT = 3001;
const DEV_BACKEND_PORT = 8000;
const PACKAGED_FRONTEND_PORT = 32109;
const PACKAGED_BACKEND_PORT = 32110;

const frontendPort = app.isPackaged ? PACKAGED_FRONTEND_PORT : DEV_FRONTEND_PORT;
const backendPort = app.isPackaged ? PACKAGED_BACKEND_PORT : DEV_BACKEND_PORT;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;

let mainWindow = null;
let backendProcess = null;
let nextProcess = null;
let staticServer = null;
let powerSaveBlockerId = null;
let isCleaningUp = false;

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "fluxa.ico")
    : path.join(__dirname, "..", "public", "fluxa.ico");
}

function getVlcExecutablePath() {
  const candidates = [
    "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
    "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "vlc";
}

function requestStatus(url, timeout = 1200) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(timeout, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForUrl(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await requestStatus(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function startBackend() {
  if (await requestStatus(`${backendUrl}/health`)) return;

  const userDataDir = app.getPath("userData");
  const dataDir = path.join(userDataDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const environment = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    FLUXA_RELOAD: "false",
    FLUXA_PORT: String(backendPort),
    FLUXA_DATABASE_PATH: path.join(dataDir, "fluxa.db"),
    FLUXA_SECRET_KEY_PATH: path.join(dataDir, ".secret.key"),
    FLUXA_CORS_ORIGINS: frontendUrl,
  };

  let executable;
  let args;
  let workingDirectory;

  if (app.isPackaged) {
    executable = path.join(process.resourcesPath, "backend", "fluxa-backend.exe");
    args = [];
    workingDirectory = path.dirname(executable);
    if (!fs.existsSync(executable)) throw new Error("Le moteur FastAPI embarqué est introuvable.");
  } else {
    const projectDir = path.resolve(__dirname, "..");
    const backendDir = path.join(projectDir, "backend");
    const virtualPython = path.join(backendDir, ".venv", "Scripts", "python.exe");
    executable = fs.existsSync(virtualPython) ? virtualPython : "python";
    args = [path.join(backendDir, "run.py")];
    workingDirectory = backendDir;
  }

  backendProcess = spawn(executable, args, {
    cwd: workingDirectory,
    env: environment,
    windowsHide: true,
    stdio: app.isPackaged ? "ignore" : "pipe",
  });
  backendProcess.on("error", (error) => console.error("[Fluxa] Backend:", error.message));
  backendProcess.on("exit", () => { backendProcess = null; });
}

function safeFrontendPath(frontendDir, requestUrl) {
  const url = new URL(requestUrl || "/", frontendUrl);
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const candidate = path.resolve(frontendDir, relativePath);
  const normalizedRoot = path.resolve(frontendDir) + path.sep;
  if (!candidate.startsWith(normalizedRoot)) return null;
  return candidate;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
  }[extension] || "application/octet-stream";
}

function startPackagedFrontend() {
  return new Promise((resolve, reject) => {
    const frontendDir = path.join(process.resourcesPath, "frontend");
    const indexPath = path.join(frontendDir, "index.html");
    if (!fs.existsSync(indexPath)) {
      reject(new Error("L'interface Fluxa embarquée est introuvable."));
      return;
    }

    staticServer = http.createServer((request, response) => {
      let filePath = safeFrontendPath(frontendDir, request.url);
      if (!filePath) {
        response.writeHead(403).end("Accès refusé");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = indexPath;
      response.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      });
      fs.createReadStream(filePath).pipe(response);
    });
    staticServer.once("error", reject);
    staticServer.listen(frontendPort, "127.0.0.1", resolve);
  });
}

async function startDevelopmentFrontend() {
  if (await requestStatus(frontendUrl)) return;
  const projectDir = path.resolve(__dirname, "..");
  const nextBinary = path.join(projectDir, "node_modules", "next", "dist", "bin", "next");
  nextProcess = spawn("node", [nextBinary, "dev", "-p", String(frontendPort)], {
    cwd: projectDir,
    windowsHide: true,
    stdio: "pipe",
    env: { ...process.env, NEXT_PUBLIC_API_URL: backendUrl },
  });
  nextProcess.on("error", (error) => console.error("[Fluxa] Frontend:", error.message));
  nextProcess.on("exit", () => { nextProcess = null; });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#090b0f",
    title: "Fluxa IPTV",
    icon: getIconPath(),
    center: true,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "splash.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  const menu = Menu.buildFromTemplate([{
    label: "Affichage",
    submenu: [
      { label: "Plein écran", accelerator: "F11", click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
      { label: "Actualiser", accelerator: "CmdOrCtrl+R", click: () => mainWindow?.reload() },
      ...(app.isPackaged ? [] : [{ label: "Outils de développement", accelerator: "CmdOrCtrl+Shift+I", click: () => mainWindow?.webContents.toggleDevTools() }]),
      { type: "separator" },
      { label: "Quitter", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
    ],
  }]);
  Menu.setApplicationMenu(menu);
}

function showStartupError(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`
    const status = document.getElementById("status-text");
    if (status) status.textContent = ${JSON.stringify(message)};
  `).catch(() => {});
}

async function startApplication() {
  createWindow();
  try {
    await startBackend();
    if (app.isPackaged) await startPackagedFrontend();
    else await startDevelopmentFrontend();

    const [backendReady, frontendReady] = await Promise.all([
      waitForUrl(`${backendUrl}/health`),
      waitForUrl(frontendUrl),
    ]);
    if (!backendReady) throw new Error("Le service local Fluxa n'a pas pu démarrer.");
    if (!frontendReady) throw new Error("L'interface Fluxa n'a pas pu démarrer.");
    if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(frontendUrl);
  } catch (error) {
    console.error("[Fluxa] Démarrage:", error);
    showStartupError(error instanceof Error ? error.message : "Fluxa n'a pas pu démarrer.");
  }
}

function shutdownBackend() {
  if (!backendProcess) return;
  try {
    const request = http.request(`${backendUrl}/shutdown`, { method: "POST", timeout: 700 }, () => {});
    request.on("error", () => {});
    request.end();
  } catch {}
}

function terminateChild(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, timeout: 2500 });
    } else child.kill("SIGTERM");
  } catch {}
}

function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) powerSaveBlocker.stop(powerSaveBlockerId);
  powerSaveBlockerId = null;
  shutdownBackend();
  staticServer?.close();
  staticServer = null;
  terminateChild(backendProcess);
  terminateChild(nextProcess);
  backendProcess = null;
  nextProcess = null;
}

ipcMain.handle("OPEN_VLC", async (_event, { streamUrl, title }) => {
  try {
    const processHandle = spawn(getVlcExecutablePath(), [streamUrl, `--meta-title=${title || "Fluxa IPTV"}`, "--no-video-title-show"], { detached: true, stdio: "ignore", windowsHide: true });
    processHandle.unref();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("SET_KEEP_AWAKE", (_event, enable) => {
  if (enable && powerSaveBlockerId === null) powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");
  if (!enable && powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId)) powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
  return true;
});
ipcMain.handle("TOGGLE_FULLSCREEN", () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});
ipcMain.handle("MINIMIZE_WINDOW", () => mainWindow?.minimize());
ipcMain.handle("MAXIMIZE_WINDOW", () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle("CLOSE_WINDOW", () => mainWindow?.close());

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(startApplication);
  app.on("before-quit", cleanup);
  app.on("window-all-closed", () => {
    cleanup();
    if (process.platform !== "darwin") app.quit();
  });
}
