// LocalLM Chat: a small desktop chat for the models on your phone.
//
// The window shows ui/index.html, the same page the phone serves at http://<phone-ip>:8080/.
// Network calls are made here in the main process rather than in the page: a page can't
// freely call a device on your network (cross-origin and local-network rules), but the app can.

const { app, BrowserWindow, ipcMain, shell, Menu } = require("electron");
const path = require("path");
const { startPairing } = require("./pairing");

/** Requests in flight, by id, so the page can stop one. */
const inflight = new Map();

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 420,
    minHeight: 480,
    backgroundColor: "#0d0f11",
    title: "LocalLM Chat",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "ui", "index.html"));

  // The page never navigates. Links open in the browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
}

/**
 * One HTTP request for the page. Streams the body back as "lmchat:chunk" events when asked to.
 * Resolves to { status, text }; rejects when the phone can't be reached.
 */
ipcMain.handle("lmchat:request", async (event, id, opts, stream) => {
  const { url, method = "GET", headers = {}, body } = opts || {};
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Enter an address starting with http://");

  const controller = new AbortController();
  inflight.set(id, controller);
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    if (!stream || !res.ok || !res.body) return { status: res.status, text: await res.text() };
    const decoder = new TextDecoder();
    for await (const part of res.body) {
      if (event.sender.isDestroyed()) break;
      event.sender.send("lmchat:chunk", id, decoder.decode(part, { stream: true }));
    }
    return { status: res.status, text: "" };
  } finally {
    inflight.delete(id);
  }
});

ipcMain.on("lmchat:abort", (_event, id) => inflight.get(id)?.abort());

// Pairing by QR code (see pairing.js). One at a time; a new one replaces the last.
let pairing = null;
ipcMain.handle("lmchat:pair-start", async (event) => {
  pairing?.stop();
  pairing = null;
  const sender = event.sender;
  const session = await startPairing((e) => {
    if (e.type !== "unreachable") pairing = null;
    if (!sender.isDestroyed()) sender.send("lmchat:pair-event", e);
  });
  pairing = session;
  return { code: session.code, svg: session.svg };
});
ipcMain.on("lmchat:pair-stop", () => {
  pairing?.stop();
  pairing = null;
});

app.whenReady().then(() => {
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
