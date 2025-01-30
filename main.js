// try {
//     require('electron-reloader')(module);
// } catch (err) {
//     console.log('Error enabling reloader:', err);
// }

const {app, BrowserWindow, dialog, Menu, MenuItem, ipcMain} = require('electron');
const path = require("path");
const fs = require('fs');
const {readdir} = require('fs/promises');
const jsdom = require("jsdom");
const {JSDOM} = jsdom;
const Twig = require('twig'); // Twig module
const chokidar = require('chokidar');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const Template = require('./src/template/template');
const AppMenu = require('./src/template/menu');

const CONFIG = {
    MAX_RECENT_FILES: 15,
    DEFAULT_OVERLAY_OPACITY: 0.3,
    WINDOW_DEFAULTS: {
        width: 1200,
        height: 900
    }
}

let watcher;
let isDirectoryOpen = false;

let latestTag;

app.commandLine.appendSwitch('disable-gpu-logging');
app.commandLine.appendSwitch('log-level', '3'); // Suppresses INFO and WARNING logs

let mainWindow;

let template;
let appMenu;

let currentView = {
    _value: "HTML",
    get value() {
        return this._value;
    },
    set value(newValue) {
        console.log(`View Variable changed: ${this._value} -> ${newValue}`);
        this._value = newValue;
        // Do something when the variable changes
    },
    toggle() {
        this.value = (this._value === "HTML") ? "PDF" : "HTML";
        appMenu.refreshViewMenu();
        switch (this.value) {
            case "HTML":
                template.render();
                break;
            case "PDF":
                renderPdf(template.renderedIndexPath);
                break;
        }
        console.log(`Switching to ${this._value} view.`);
    }
};


app.on('ready', () => {
    (async () => {
        return getLatestTag("ikadar", "prince-scripts");
    })().then((lt) => {
        latestTag = lt;

        mainWindow = new BrowserWindow({
            width: CONFIG.WINDOW_DEFAULTS.width,
            height: CONFIG.WINDOW_DEFAULTS.height,
            webPreferences: {
                preload: `${__dirname}/preload.js`,
                nodeIntegration: true,
                contextIsolation: true,
            }
        });

        template = new Template(mainWindow);
        appMenu = new AppMenu(app, template, CONFIG);
        template.setAppMenu(appMenu);
        
        mainWindow.loadFile('index.html');

        ipcMain.on('send-value', (event, value) => {
            template.updateOverlaySize(value);
        });

        appMenu.createInitialTemplate();
        appMenu.refreshOpenRecentMenu();
    });
});

app.on('window-all-closed', async () => {
    try {
        console.log('Stopping the watcher...');
        if (watcher) {
            await watcher.close();
        }
        // Clear any other resources
        mainWindow = null;
        app.quit();
    } catch (err) {
        console.error('Error during cleanup:', err);
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Stop watcher on termination signal
process.on('SIGINT', () => {
    console.log('Stopping the watcher...');
    watcher.close();
    process.exit();
});

getLatestTag = async (username, repo) => {
    const url = `https://api.github.com/repos/${username}/${repo}/tags`;
    const response = await fetch(url);

    const tags = await response.json();

    if (tags.length > 0) {
        return `v${tags[0].name}`;
    } else {
        return null;
    }
}

renderPdf = (inputPath) => {
    exec(`prince -v -j -o '${__dirname}/output.pdf' '${inputPath}'`, (error, stdout, stderr) => {
        if (error) {
            console.error('Prince XML is not installed or not in PATH.');
            return;
        }
        console.log(stdout.trim());
        mainWindow.loadFile('output.pdf');
    });

}
