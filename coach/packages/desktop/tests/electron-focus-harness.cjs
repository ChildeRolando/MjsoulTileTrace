const { app, BrowserWindow } = require("electron");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
app.setPath("userData", input.profile);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: input.width ?? 1180,
    height: input.height ?? 820,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  window.webContents.on("console-message", (event) => {
    if (event.level >= 2) console.error(`RENDERER_ERROR=${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  try {
    await window.loadURL(pathToFileURL(join(input.directory, "page.html")).href);
    const results = [];
    for (const scenario of input.scenarios) {
      try { await window.webContents.executeJavaScript(scenario); }
      catch (error) {
        console.error(`SCENARIO_FAILED=${error instanceof Error ? error.stack : String(error)}`);
        throw error;
      }
      window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      results.push(await window.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(() => resolve(
        typeof window.focusResult === 'function' ? window.focusResult() :
        ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent, tabIndex: document.activeElement?.tabIndex })
      ), 20))`));
    }
    if (typeof input.capturePath === "string") {
      const capture = await window.webContents.capturePage();
      writeFileSync(input.capturePath, capture.toPNG());
    }
    console.log(`FOCUS_RESULT=${JSON.stringify(results)}`);
  } finally {
    window.destroy();
  }
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
