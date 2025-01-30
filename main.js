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

let appMenuTemplate;

let latestTag;

app.commandLine.appendSwitch('disable-gpu-logging');
app.commandLine.appendSwitch('log-level', '3'); // Suppresses INFO and WARNING logs

let mainWindow;

let template;

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
        refreshViewMenu();
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

        template = new Template(mainWindow);  // <-- Here's where Template is instantiated
        
        mainWindow.loadFile('index.html');

        ipcMain.on('send-value', (event, value) => {
            template.updateOverlaySize(value);
        });

        appMenuTemplate = createInitialAppMenuTemplate();
        refreshOpenRecentMenu();
        // createAppMenu(appMenuTemplate);


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

const createAppMenu = (menuTemplate) => {

    // console.log(">>>>>>>>>>>>>> refreshing menu template" );
    // console.log(JSON.stringify(menuTemplate, null, 2));
    // console.log(">>>>>>>>>>>>>> /refreshing menu template" );

    appMenuTemplate = menuTemplate;

    const menu = Menu.buildFromTemplate(appMenuTemplate);

    Menu.setApplicationMenu(menu);
}

/**
 * Recursively updates a menu item by its unique ID.
 * @param {string} id - The ID of the menu item to update.
 * @param {object} updates - An object containing the properties to update.
 */
function updateMenuItem(id, updates) {
    function recursiveUpdate(items) {
        return items.map(item => {
            if (item.id === id) {
                return { ...item, ...updates }; // Shallow merge replaces submenu
            }
            if (item.submenu) {
                return { ...item, submenu: recursiveUpdate(item.submenu) };
            }
            return item;
        });
    }

    appMenuTemplate = recursiveUpdate(appMenuTemplate);
    createAppMenu(appMenuTemplate);
}

/**
 * Recursively retrieves the submenu array for a menu item by its unique ID.
 * @param {string} id - The ID of the menu item.
 * @returns {Array|null} - The submenu array if found, otherwise null.
 */
function getSubmenu(id) {
    function recursiveFind(items) {
        for (const item of items) {
            if (item.id === id) {
                return item.submenu || null;
            }
            if (item.submenu) {
                const found = recursiveFind(item.submenu);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    return recursiveFind(appMenuTemplate);
}

const createInitialAppMenuTemplate = () => {
    let menuTemplate = [
        {
            id: 'fileMenu',
            label: "File",
            submenu: [
                {
                    id: 'openDirectory',
                    label: "Open Directory",
                    click: selectDirectory,
                    accelerator: 'CmdOrCtrl+O',
                },
                {
                    id: 'openRecent',
                    label: "Open recent",
                    submenu: []
                },
            ],
        },
        {
            id: 'viewMenu',
            label: 'View',
            submenu: [
                {
                    id: 'view.reload',
                    label: 'Reload',
                    enabled: isDirectoryOpen,
                    accelerator: 'CmdOrCtrl+R',
                    role: "reload"
                },
                {
                    id: 'view.toggleDevTools',
                    label: 'Toggle DevTools',
                    accelerator: 'CmdOrCtrl+Alt+I',
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.toggleDevTools();
                    },
                },
                {
                    type: "separator"
                },
                {
                    id: 'toggleOverlay',
                    label: 'Toggle overlay',
                    accelerator: 'CmdOrCtrl+Alt+V',
                    enabled: isDirectoryOpen,
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    id: 'increaseOverlayOpacity',
                    label: 'Increase overlay opacity',
                    accelerator: 'CmdOrCtrl+Alt+P',
                    enabled: isDirectoryOpen,
                },
                {
                    id: 'decreaseOverlayOpacity',
                    label: 'Decrease overlay opacity',
                    accelerator: 'CmdOrCtrl+Alt+O',
                    enabled: isDirectoryOpen,
                },
                {
                    type: "separator"
                },
                {
                    id: 'zoomIn',
                    role: "zoomIn",
                    enabled: isDirectoryOpen,
                },
                {
                    id: 'zoomOut',
                    role: "zoomOut",
                    enabled: isDirectoryOpen,
                },
                {
                    id: 'resetZoom',
                    role: "resetZoom",
                    enabled: isDirectoryOpen,
                },
                {
                    type: "separator"
                },
                {
                    id: 'mediaScreen',
                    label: 'Media: screen',
                    enabled: false,
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    id: 'mediaPrint',
                    label: 'Media: print',
                    enabled: false,
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    type: "separator"
                },
                {
                    id: 'showPdf',
                    label: 'Show PDF',
                    enabled: isDirectoryOpen && currentView.value !== "PDF",
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    id: 'showHtml',
                    label: 'Show HTML',
                    enabled: isDirectoryOpen && currentView.value !== "HTML",
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    id: 'toggleView',
                    label: 'Toggle view',
                    enabled: isDirectoryOpen,
                    accelerator: 'CmdOrCtrl+Alt+T',
                    click: (menuItem, browserWindow) => {
                        console.log("TOGGLE");
                    },
                },
            ],
        },
        {
            id: 'testMenu',
            label: 'Test',
            submenu: [
                {
                    id: 'test.none',
                    isTestFile: true,
                    label: 'None',
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {type: "separator"},
                {
                    id: 'toggleTest',
                    label: 'Toggle test',
                    enabled: isDirectoryOpen,
                    accelerator: 'CmdOrCtrl+Alt+M',
                    click: async (menuItem, browserWindow) => {
                        await template.toggleTestFile();
                        template.render();
                        await refreshTestMenu();
                        console.log("TOGGLE TEST");
                    }
                },
            ],
        },
    ];

    if (process.platform === 'darwin') {
        menuTemplate.unshift({
            id: 'appMenu',
            label: app.name,
            submenu: [
                {id: 'about', role: 'about'},
                {type: 'separator'},
                {id: 'services', role: 'services'},
                {type: 'separator'},
                {id: 'hide', role: 'hide'},
                {id: 'hideOthers', role: 'hideothers'},
                {id: 'unhide', role: 'unhide'},
                {type: 'separator'},
                {id: 'quit', role: 'quit'},
            ],
        });
    }

    return menuTemplate;
}

const selectDirectory = () => {
    dialog
        .showOpenDialog(mainWindow, {
            properties: ["openDirectory"],
        })
        .then((result) => {
            if (!result.canceled) {
                const selectedDir = result.filePaths[0];
                openDirectory(selectedDir);  // No return needed
            }
        })
        .catch(err => {
            console.error('Error selecting directory:', err);
            dialog.showErrorBox('Error', 'Failed to open directory: ' + err.message);
        });
}

const openDirectory = (selectedDir) => {
    template.setDirectory(selectedDir);

    const exists = fs.existsSync(template.indexPath);

    if (!exists) {
        console.error('index.html not found in the selected directory');
        dialog.showErrorBox('Error', 'No index.html found in the selected directory.');
        return;
    }

    isDirectoryOpen = true;
    
    return template.readTestDataFiles()
        .then(() => refreshTestMenu())
        .then(() => addRecentPath(template.directoryPath))
        .then(() => {
            template.checkOverlayImage();
            template.render();
            if (!!watcher) {
                console.log('Stopping the watcher...');
                watcher.close();
            }
            watcher = watchDirectory(template.directoryPath);
            refreshViewMenu();
        })
        .catch(err => {
            console.error('Error in openDirectory:', err);
            dialog.showErrorBox('Error', 'Failed to open directory: ' + err.message);
        });
}

const watchDirectory = (selectedDir) => {
    console.log('Starting the watcher...');

    const watcher = chokidar.watch(selectedDir, {
        ignored: (path, stats) => {
            const parts = path.split('/');
            const isDotted = parts.some((part) => part.startsWith('.'));
            return isDotted || path === template.renderedIndexPath;
        },
        persistent: true,
        ignoreInitial: true,
        depth: Infinity,
    });

    watcher.on('change', (path) => {
        template.render();
    });

    return watcher;
}

const refreshTestMenu = async () => {
    try {
        let newTestSubmenu = template.testFiles.files.map(file => {
            return {
                id: `test.${file}`,
                isTestFile: true,
                label: file,
                click: (menuItem) => {
                    template.selectTestFile(menuItem.label);
                    template.render();
                }
            };
        });

        updateMenuItem("toggleTest", {enabled: newTestSubmenu.length > 0});
        let currentTestSubmenu = getSubmenu("testMenu").filter(item => !item?.isTestFile);
        newTestSubmenu = [...newTestSubmenu, ...currentTestSubmenu];
        
        updateMenuItem("testMenu", {
            submenu: newTestSubmenu
        });
    
        createAppMenu(appMenuTemplate);
    } catch (err) {
        console.error('Error reading directory:', err);
    }
}

const refreshOpenRecentMenu = () => {
    loadRecentFiles()
        .then(recentFiles => {
            const newAppMenuTemplate = appMenuTemplate.map(mainMenuItem => {
                if (mainMenuItem.id === "fileMenu") {
                    return {
                        id: "fileMenu",
                        label: "File",
                        submenu: mainMenuItem.submenu.map(submenuItem => {
                            if (submenuItem.id === "openRecent") {
                                return {
                                    id: submenuItem.id,
                                    label: submenuItem.label,
                                    submenu: recentFiles.map(file => {
                                        return {
                                            id: `recent.${file}`,
                                            label: file,
                                            click: (menuItem, browserWindow) => {
                                                openDirectory(menuItem.label);
                                            }
                                        }
                                    })
                                }
                            }
                            return submenuItem;
                        })
                    }
                }
                return mainMenuItem;
            });

            createAppMenu(newAppMenuTemplate);
        })
        .catch(err => {
            console.error('Error refreshing recent menu:', err);
        });
}

const refreshViewMenu = () => {

    const newAppMenuTemplate = appMenuTemplate.map(mainMenuItem => {
        if (mainMenuItem.id === "viewMenu") {
            return {
                id: "viewMenu",
                label: 'View',
                submenu: [
                    {
                        id: 'view.reload',
                        label: 'Reload',
                        enabled: isDirectoryOpen,
                        accelerator: 'CmdOrCtrl+R',
                        role: "reload"
                    },
                    {
                        id: 'view.toggleDevTools',
                        label: 'Toggle DevTools',
                        accelerator: 'CmdOrCtrl+Alt+I',
                        click: (menuItem, browserWindow) => {
                            if (browserWindow) browserWindow.webContents.toggleDevTools();
                        },
                    },
                    {
                        type: "separator"
                    },
                    {
                        id: 'toggleOverlay',
                        label: 'Toggle overlay',
                        accelerator: 'CmdOrCtrl+Alt+V',
                        enabled: isDirectoryOpen && template.hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            template.toggleOverlay();
                            template.render();
                        },
                    },
                    {
                        id: 'increaseOverlayOpacity',
                        label: 'Increase overlay opacity',
                        accelerator: 'CmdOrCtrl+Alt+P',
                        enabled: isDirectoryOpen && template.hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            template.increaseOverlayOpacity();
                            template.render();
                        },
                    },
                    {
                        id: 'decreaseOverlayOpacity',
                        label: 'Decrease overlay opacity',
                        accelerator: 'CmdOrCtrl+Alt+O',
                        enabled: isDirectoryOpen && template.hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            template.decreaseOverlayOpacity();
                            template.render();
                        },
                    },
                    {
                        type: "separator"
                    },
                    {
                        id: 'zoomIn',
                        role: "zoomIn",
                        enabled: isDirectoryOpen,
                    },
                    {
                        id: 'zoomOut',
                        role: "zoomOut",
                        enabled: isDirectoryOpen,
                    },
                    {
                        id: 'resetZoom',
                        role: "resetZoom",
                        enabled: isDirectoryOpen,
                    },
                    {
                        type: "separator"
                    },
                    {
                        id: 'mediaScreen',
                        label: 'Media: screen',
                        enabled: false,
                        click: (menuItem, browserWindow) => {
                            console.log(menuItem.label);
                        },
                    },
                    {
                        id: 'mediaPrint',
                        label: 'Media: print',
                        enabled: false,
                        click: (menuItem, browserWindow) => {
                            console.log(menuItem.label);
                        },
                    },
                    {
                        type: "separator"
                    },
                    {
                        id: 'showPdf',
                        label: 'Show PDF',
                        enabled: isDirectoryOpen && currentView.value !== "PDF",
                        click: (menuItem, browserWindow) => {
                            currentView.value = "PDF";
                            renderPdf(template.renderedIndexPath);
                            refreshViewMenu()
                            console.log(menuItem.label);
                        },
                    },
                    {
                        id: 'showHtml',
                        label: 'Show HTML',
                        enabled: isDirectoryOpen && currentView.value !== "HTML",
                        click: (menuItem, browserWindow) => {
                            currentView.value = "HTML";
                            template.render();
                            refreshViewMenu();
                            console.log(menuItem.label);
                        },
                    },
                    {
                        id: 'toggleView',
                        label: 'Toggle view',
                        enabled: isDirectoryOpen,
                        accelerator: 'CmdOrCtrl+Alt+T',
                        click: (menuItem, browserWindow) => {
                            currentView.toggle();
                        },
                    },

                ],
            }
        }
        // console.log(mainMenuItem);
        return mainMenuItem;
    });

    createAppMenu(newAppMenuTemplate);

}

const loadRecentFiles = () => {
    const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
    
    try {
        return fs.promises.access(recentFilesPath)
            .then(() => fs.promises.readFile(recentFilesPath, 'utf8'))
            .then(content => JSON.parse(content))
            .catch(() => {
                // File doesn't exist or error reading, create new file
                const emptyList = [];
                return fs.promises.writeFile(recentFilesPath, JSON.stringify(emptyList))
                    .then(() => emptyList);
            });
    } catch (err) {
        console.error('Error loading recent files:', err);
        return [];
    }
}

const addRecentPath = (dirPath) => {
    const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
    
    return loadRecentFiles()  // Return the Promise chain
        .then(recentFiles => {
            recentFiles.unshift(dirPath);
            const uniqueRecentFiles = [...new Set(recentFiles)];
            const trimmedFiles = uniqueRecentFiles.slice(0, CONFIG.MAX_RECENT_FILES);
            
            return fs.promises.writeFile(recentFilesPath, JSON.stringify(trimmedFiles))
                .then(() => refreshOpenRecentMenu());
        })
        .catch(err => {
            console.error('Error adding recent path:', err);
        });
}


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
