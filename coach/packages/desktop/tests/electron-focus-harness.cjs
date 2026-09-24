const { app, BrowserWindow } = require("electron");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
app.setPath("userData", input.profile);
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    await window.loadURL(pathToFileURL(join(input.directory, "page.html")).href);
    const results = [];
    for (const scenario of input.scenarios) {
      await window.webContents.executeJavaScript(scenario);
      window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      results.push(await window.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(() => resolve(
        typeof window.focusResult === 'function' ? window.focusResult() :
        ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent, tabIndex: document.activeElement?.tabIndex })
      ), 20))`));
    }
    console.log(`FOCUS_RESULT=${JSON.stringify(results)}`);
  } finally {
    window.destroy();
  }
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
