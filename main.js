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

app.commandLine.appendSwitch('disable-gpu-logging');
app.commandLine.appendSwitch('log-level', '3'); // Suppresses INFO and WARNING logs

let mainWindow;

let template;
let appMenu;

app.on('ready', () => {
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

    appMenu.createInitialTemplate();
    appMenu.refreshOpenRecentMenu();
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
