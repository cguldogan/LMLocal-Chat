// Gives the page one capability: HTTP requests made by the app (see main.js).
const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();
ipcRenderer.on("lmchat:chunk", (_event, id, text) => listeners.get(id)?.(text));

let next = 0;

contextBridge.exposeInMainWorld("lmchat", {
  /**
   * opts: { url, method, headers, body }. onChunk, when given, receives the body as it streams.
   * Returns { abort(), done } where done resolves to { status, text }.
   */
  request(opts, onChunk) {
    const id = `${Date.now()}-${next++}`;
    if (typeof onChunk === "function") listeners.set(id, onChunk);
    const done = ipcRenderer
      .invoke("lmchat:request", id, opts, typeof onChunk === "function")
      .finally(() => listeners.delete(id));
    return { abort: () => ipcRenderer.send("lmchat:abort", id), done };
  },

  /** Shows a QR code for the phone to scan. Resolves to { code, svg }. */
  pairStart: () => ipcRenderer.invoke("lmchat:pair-start"),
  pairStop: () => ipcRenderer.send("lmchat:pair-stop"),
  /** { type: "paired", baseUrl, key, device } | { type: "unreachable", message } | { type: "expired" } */
  onPairEvent(callback) {
    ipcRenderer.on("lmchat:pair-event", (_event, e) => callback(e));
  },
});
