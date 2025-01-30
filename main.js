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
let hasOverlayImage = false;
let showOverlayImage = false;

let appMenuTemplate;

let latestTag;

app.commandLine.appendSwitch('disable-gpu-logging');
app.commandLine.appendSwitch('log-level', '3'); // Suppresses INFO and WARNING logs

let mainWindow;
let overlaySize = {
    overlayLeft: undefined,
    overlayTop: undefined,
    overlayWidth: undefined,
    overlayHeight: undefined,
    overlayOpacity: CONFIG.DEFAULT_OVERLAY_OPACITY
}

let testFiles = {
    files: ["none"],
    selectedTestFile: "none",
    selectedTestFileIndex: 0,
    async readTestDataFiles (templateDir) {
        const testDataDirectory = `${templateDir}/test`;
        const testDataDirectoryExists = fs.existsSync(testDataDirectory);

        this.files = ["none"];

        if (testDataDirectoryExists) {
            this.files = await readdir(testDataDirectory);
            this.files.unshift("none");
        }
    },
    selectTestFile (label) {
        this.selectedTestFile = label;
        this.selectedTestFileIndex = this.files.indexOf(label);
    },
    async toggleTestFile () {
        this.selectedTestFileIndex = (this.selectedTestFileIndex + 1) % this.files.length;
        this.selectedTestFile = this.files[this.selectedTestFileIndex];
        console.log(this.selectedTestFile);
        await refreshTestMenu();
    }
}

let template = {
    directoryPath: null,
    indexPath: null,
    renderedIndexPath: null,
};

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
                renderTemplate();
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
                contextIsolation: true, // Disable context isolation for simplicity
            }
        });

        mainWindow.loadFile('index.html');

        ipcMain.on('send-value', (event, value) => {
            overlaySize = {...overlaySize, ...value};
            // console.log('Overlay:', overlaySize);
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
                    click: (menuItem, browserWindow) => {
                        testFiles.toggleTestFile();
                        renderTemplate();
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

    template.directoryPath = selectedDir;
    template.indexPath = path.join(selectedDir, "index.html");
    template.renderedIndexPath = path.join(selectedDir, "__index.html");

    const exists = fs.existsSync(template.indexPath);

    if (!exists) {
        console.error('index.html not found in the selected directory');
        dialog.showErrorBox('Error', 'No index.html found in the selected directory.');
        return;
    }

    isDirectoryOpen = true;

    testFiles.selectedTestFile = null;
    testFiles.selectedTestFileIndex = null;

    // Start promise chain with readTestDataFiles
    return testFiles.readTestDataFiles(template.directoryPath)
        .then(() => refreshTestMenu())
        .then(() => addRecentPath(template.directoryPath))
        .then(() => {
            renderTemplate();
            if (!!watcher) {
                console.log('Stopping the watcher...');
                watcher.close();
            }
            watcher = watchDirectory(template.directoryPath, template.indexPath, template.renderedIndexPath);

            hasOverlayImage = fs.existsSync(`${template.directoryPath}/img/template-overlay.png`)
            refreshViewMenu(template.directoryPath, template.indexPath, template.renderedIndexPath);
        })
        .catch(err => {
            console.error('Error in openDirectory:', err);
            dialog.showErrorBox('Error', 'Failed to open directory: ' + err.message);
        });
}

const readTestData = () => {
    if (!testFiles.selectedTestFile || (testFiles.selectedTestFile === "none")) {
        return Promise.resolve({error: null, data: {}});
    }

    return fs.promises.readFile(`${template.directoryPath}/test/${testFiles.selectedTestFile}`, 'utf8')
        .then(content => ({
            error: null,
            data: JSON.parse(content)
        }))
        .catch(err => ({
            error: err,
            data: null
        }));
}

const renderT = (template, data) => {

    let twig;

    // compile template
    try {
        twig = Twig.twig({
            data: template,
            rethrow: true
        });
    } catch (err) {
        dialog.showErrorBox('Twig compile error', err.message);
        return null;
    }

    // render template
    try {
        const renderedContent = twig.render(data);
        return renderedContent;
    } catch (err) {
        dialog.showErrorBox('Twig compile error', err.message);
        return null;
    }
}

const renderTemplate = () => {
    return JSDOM.fromFile(template.indexPath)
        .then(dom => {

            const document = dom.window.document;

            /////// ADD SCRIPTS

            // Squeezing related script

            const bodyElement = document.getElementsByTagName("body")[0];
            const headElement = document.getElementsByTagName("head")[0];

            // Add squeeze script
            const additionalScriptElement = document.createElement("script");

            // additionalScriptElement.src = `https://cdn.jsdelivr.net/gh/ikadar/prince-scripts@${latestTag}/squeeze.js`;
            additionalScriptElement.src = `${__dirname}/squeeze.js`;

            bodyElement.appendChild(additionalScriptElement);

            ////////

            // const additionalScriptElement4 = document.createElement("script");
            //
            // additionalScriptElement4.src = `https://cdn.jsdelivr.net/gh/ikadar/prince-scripts@${latestTag}/squeeze.js`;
            // additionalScriptElement4.src = `${__dirname}/squeeze-spacing.js`;
            //
            // bodyElement.appendChild(additionalScriptElement4);

            // Overlay realted scripts
            // ---

            if (showOverlayImage && fs.existsSync(`${template.directoryPath}/img/template-overlay.png`)) {
                // Add overlay script with settings
                const overlaySettingsScript = document.createElement("script");
                overlaySettingsScript.text = Object.keys(overlaySize).map(key => {
                    const value = (typeof overlaySize[key] === "undefined") ? `${overlaySize[key]}` : `"${overlaySize[key]}"`;
                    return `const ${key} = ${value};`
                }).join("\n");
                bodyElement.appendChild(overlaySettingsScript);

                // Add overlay div
                const overlayDiv = document.createElement("div");
                overlayDiv.id = "editor-overlay";
                overlayDiv.innerHTML = '<div class="resize-handle"></div>';
                bodyElement.appendChild(overlayDiv);

                // Add overlay script
                const overlayScript = document.createElement("script");
                overlayScript.src = `${__dirname}/overlay.js`;
                bodyElement.appendChild(overlayScript);

                // Add overlay styles
                const overlayStyles = document.createElement("link");
                overlayStyles.rel = "stylesheet";
                overlayStyles.href = `${__dirname}/overlay.css`;
                headElement.appendChild(overlayStyles);
            }

            return readTestData()
                .then(result => result.error ? {} : result.data)
                .then(testData => {
                    const renderedContent = renderT(dom.serialize(), testData);
                    if (!renderedContent) {
                        throw new Error('Failed to render template');
                    }
                    return writeRenderedHtml(renderedContent);
                });
        })
        .then(() => {
            mainWindow.loadFile(template.renderedIndexPath);
        })
        .catch(err => {
            console.error('Error rendering template:', err);
            dialog.showErrorBox('Render Error', `Failed to render template: ${err.message}`);
            throw err; // Re-throw to let caller handle if needed
        });
};

const writeRenderedHtml = (renderedContent) => {
    return fs.promises.writeFile(template.renderedIndexPath, renderedContent);
};

const watchDirectory = (selectedDir) => {

    console.log('Starting the watcher...');

    // Initialize watcher
    const watcher = chokidar.watch(selectedDir, {
        ignored: (path, stats) => {
            // Ignore dotfiles
            const parts = path.split('/'); // Split the path into parts
            const isDotted = parts.some((part) => part.startsWith('.')); // Check if any part starts with a dot

            return isDotted || path === template.renderedIndexPath;
        },
        persistent: true,         // Keep the process running
        ignoreInitial: true,      // Watch changes immediately
        depth: Infinity,          // Recursively watch all levels
    });

    // Handle events
    watcher
        .on('add', (path) => {
            // console.log(`File added: ${path}`);
        })
        .on('change', (path) => {
            // console.log(`File changed: ${path}`);
            renderTemplate();
        })
        .on('unlink', (path) => {
            // console.log(`File removed: ${path}`);
        });

    return watcher;
}

const refreshTestMenu = async () => {

    try {

        let newTestSubmenu = testFiles.files.map(file => {
            return {
                id: `test.${file}`,
                isTestFile: true,
                label: file,
                click: (menuItem) => {
                    testFiles.selectTestFile(menuItem.label);
                    renderTemplate();
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
                        enabled: isDirectoryOpen && hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            showOverlayImage = !showOverlayImage;
                            renderTemplate();
                        },
                    },
                    {
                        id: 'increaseOverlayOpacity',
                        label: 'Increase overlay opacity',
                        accelerator: 'CmdOrCtrl+Alt+P',
                        enabled: isDirectoryOpen && hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            overlaySize.overlayOpacity += 0.1
                            overlaySize.overlayOpacity = Math.min(overlaySize.overlayOpacity, 1);
                            renderTemplate();
                        },
                    },
                    {
                        id: 'decreaseOverlayOpacity',
                        label: 'Decrease overlay opacity',
                        accelerator: 'CmdOrCtrl+Alt+O',
                        enabled: isDirectoryOpen && hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            overlaySize.overlayOpacity -= 0.1
                            overlaySize.overlayOpacity = Math.max(overlaySize.overlayOpacity, 0);
                            renderTemplate();
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
                            renderTemplate();
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
