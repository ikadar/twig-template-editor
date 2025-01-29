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
    toggle(selectedDir, indexPath, renderedIndexPath) {
        this.value = (this._value === "HTML") ? "PDF" : "HTML";
        refreshViewMenu(selectedDir, indexPath, renderedIndexPath);
        switch (this.value) {
            case "HTML":
                renderTemplate(selectedDir, indexPath, renderedIndexPath);
                break;
            case "PDF":
                renderPdf(renderedIndexPath);
                break;
        }
        console.log(`Switching to ${this._value} view.`);
    }
};

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
    async toggleTestFile (templateDir, indexPath, renderedIndexPath) {
        this.selectedTestFileIndex = (this.selectedTestFileIndex + 1) % this.files.length;
        this.selectedTestFile = this.files[this.selectedTestFileIndex];
        console.log(this.selectedTestFile);
        await refreshTestMenu(templateDir, indexPath, renderedIndexPath);
    }
}

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

const createInitialAppMenuTemplate = () => {

    let menuTemplate = [
        {
            label: "File",
            //accelerator: 'CmdorCtrl+F',
            submenu: [
                {
                    label: "Open Directory",
                    click: selectDirectory, // Open directory function
                    accelerator: 'CmdOrCtrl+O',
                },
                {
                    label: "Open recent",
                    submenu: []
                    // submenu: recentFiles.map(item => {
                    //     return {
                    //         label: item
                    //     }
                    // })
                },
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Reload',
                    enabled: isDirectoryOpen,
                    accelerator: 'CmdOrCtrl+R',
                    role: "reload"
                },
                {
                    label: 'Toggle DevTools',
                    accelerator: 'CmdOrCtrl+Alt+I', // Shortcut for Windows/Linux
                    click: (menuItem, browserWindow) => {
                        if (browserWindow) browserWindow.webContents.toggleDevTools();
                    },
                },
                {
                    type: "separator"
                },
                {
                    label: 'Toggle overlay',
                    accelerator: 'CmdOrCtrl+Alt+V', // Shortcut for Windows/Linux
                    enabled: isDirectoryOpen,
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    label: 'Increase overlay opacity',
                    accelerator: 'CmdOrCtrl+Alt+P', // Shortcut for Windows/Linux
                    enabled: isDirectoryOpen,
                },
                {
                    label: 'Decrease overlay opacity',
                    accelerator: 'CmdOrCtrl+Alt+O', // Shortcut for Windows/Linux
                    enabled: isDirectoryOpen,
                },
                {
                    type: "separator"
                },
                {
                    role: "zoomIn",
                    enabled: isDirectoryOpen,
                },
                {
                    role: "zoomOut",
                    enabled: isDirectoryOpen,
                },
                {
                    role: "resetZoom",
                    enabled: isDirectoryOpen,
                },
                {
                    type: "separator"
                },
                {
                    label: 'Media: screen',
                    enabled: false,
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
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
                    label: 'Show PDF',
                    enabled: isDirectoryOpen && currentView.value !== "PDF",
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
                    label: 'Show HTML',
                    enabled: isDirectoryOpen && currentView.value !== "HTML",
                    click: (menuItem, browserWindow) => {
                        console.log(menuItem.label);
                    },
                },
                {
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
            label: 'Test',
            submenu: [],
        },
    ];

    if (process.platform === 'darwin') {
        menuTemplate.unshift({
            label: app.name,
            submenu: [
                {role: 'about'},
                {type: 'separator'},
                {role: 'services'},
                {type: 'separator'},
                {role: 'hide'},
                {role: 'hideothers'},
                {role: 'unhide'},
                {type: 'separator'},
                {role: 'quit'},
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
                return openDirectory(selectedDir);  // Return the Promise
            }
        })
        .catch(err => {
            console.error('Error selecting directory:', err);
        });
}

const openDirectory = async (selectedDir) => {
    const indexPath = path.join(selectedDir, "index.html");
    const renderedIndexPath = path.join(selectedDir, "__index.html");

    const exists = fs.existsSync(indexPath);

    if (!exists) {
        console.error('index.html not found in the selected directory');
        dialog.showErrorBox('Error', 'No index.html found in the selected directory.');
        return;
    }

    isDirectoryOpen = true;

    testFiles.selectedTestFile = null;
    testFiles.selectedTestFileIndex = null;

    await testFiles.readTestDataFiles(selectedDir);
    await refreshTestMenu(selectedDir, indexPath, renderedIndexPath);

    addRecentPath(selectedDir)
        .then(() => {
            renderTemplate(selectedDir, indexPath, renderedIndexPath);
            if (!!watcher) {
                console.log('Stopping the watcher...');
                watcher.close();
            }
            watcher = watchDirectory(selectedDir, indexPath, renderedIndexPath);

            hasOverlayImage = fs.existsSync(`${selectedDir}/img/template-overlay.png`)
            refreshViewMenu(selectedDir, indexPath, renderedIndexPath);
        });
}

const readTestData = (directoryPath) => {
    if (!testFiles.selectedTestFile || (testFiles.selectedTestFile === "none")) {
        return Promise.resolve({error: null, data: {}});
    }

    return fs.promises.readFile(`${directoryPath}/test/${testFiles.selectedTestFile}`, 'utf8')
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

const renderTemplate = (directoryPath, indexPath, renderedIndexPath) => {
    JSDOM.fromFile(indexPath)
        .then(dom => {
            const document = dom.window.document;

            /////// ADD SCRIPTS

            // Squeezing related script

            const bodyElement = document.getElementsByTagName("body")[0];
            const headElement = document.getElementsByTagName("head")[0];

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

            if (showOverlayImage && fs.existsSync(`${directoryPath}/img/template-overlay.png`)) {

                const additionalScriptElement3 = document.createElement("script");

                additionalScriptElement3.text = Object.keys(overlaySize).map(key => {
                    const value = (typeof overlaySize[key] === "undefined") ? `${overlaySize[key]}` : `"${overlaySize[key]}"`;
                    return `const ${key} = ${value};`
                }).join("\n");
                bodyElement.appendChild(additionalScriptElement3);

                const additionalDivElement = document.createElement("div");
                additionalDivElement.id= "editor-overlay";
                additionalDivElement.innerHTML = '<div class="resize-handle"></div>';

                bodyElement.appendChild(additionalDivElement);

                // ---

                const additionalScriptElement2 = document.createElement("script");

                additionalScriptElement2.src = `${__dirname}/overlay.js`;
                // additionalScriptElement2.src = `https://cdn.jsdelivr.net/gh/ikadar/prince-scripts@${latestTag}/overlay.js`;

                bodyElement.appendChild(additionalScriptElement2);

                // ---

                const additionalStyleElement = document.createElement("link");

                additionalStyleElement.rel = "stylesheet";
                additionalStyleElement.href = `${__dirname}/overlay.css`;
                // additionalStyleElement.href = `https://cdn.jsdelivr.net/gh/ikadar/prince-scripts@${latestTag}/overlay.css`;

                headElement.appendChild(additionalStyleElement);
            }

            /////// ADD SCRIPTS END

            readTestData(directoryPath)
                .then(result => {
                    if (!!result.error) {
                        return {};
                    }
                    return result.data;
                })
                .then(testData => {
                    const renderedContent = renderT(dom.serialize(), testData);
                    if (!!renderedContent) {
                        writeRenderedHtml(renderedIndexPath, renderedContent);
                    }
                });
        });
}

const writeRenderedHtml = (renderedIndexPath, renderedContent) => {
    fs.writeFile(renderedIndexPath, renderedContent, err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
            mainWindow.loadFile(renderedIndexPath); // Load the index.html file
            // console.log(`Loaded: ${renderedIndexPath}`);
        }
    });
}

const watchDirectory = (selectedDir, indexPath, renderedIndexPath) => {

    console.log('Starting the watcher...');

    // Initialize watcher
    const watcher = chokidar.watch(selectedDir, {
        ignored: (path, stats) => {
            // Ignore dotfiles
            const parts = path.split('/'); // Split the path into parts
            const isDotted = parts.some((part) => part.startsWith('.')); // Check if any part starts with a dot

            return isDotted || path === renderedIndexPath;
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
            renderTemplate(selectedDir, indexPath, renderedIndexPath);
        })
        .on('unlink', (path) => {
            // console.log(`File removed: ${path}`);
        });

    return watcher;
}

const refreshTestMenu = async (templateDir, indexPath, renderedIndexPath) => {

    try {

        const newAppMenuTemplate = appMenuTemplate.map(mainMenuItem => {
            if (mainMenuItem.label === "Test") {
                let menuItem = {
                    label: "Test",
                    submenu: testFiles.files.map(file => {
                        return {
                            label: file,
                            click: (menuItem) => {
                                testFiles.selectTestFile(menuItem.label);
                                // testFiles.selectedTestFile = menuItem.label;
                                renderTemplate(templateDir, indexPath, renderedIndexPath);
                                // console.log(menuItem.label);
                            }
                        }
                    })
                };

                menuItem.submenu.push({
                    type: "separator"
                });

                menuItem.submenu.push({
                    label: 'Toggle test',
                    enabled: isDirectoryOpen,
                    accelerator: 'CmdOrCtrl+Alt+M',
                    click: (menuItem, browserWindow) => {
                        testFiles.toggleTestFile(templateDir, indexPath, renderedIndexPath);
                        renderTemplate(templateDir, indexPath, renderedIndexPath);
                        console.log("TOGGLE TEST");
                    }
                });

                return menuItem;
            }
            return mainMenuItem;
        });

        createAppMenu(newAppMenuTemplate);

    } catch (err) {
        console.error('Error reading directory:', err);
    }
}

const refreshOpenRecentMenu = () => {
    loadRecentFiles()
        .then(recentFiles => {
            const newAppMenuTemplate = appMenuTemplate.map(mainMenuItem => {
                if (mainMenuItem.label === "File") {
                    return {
                        label: "File",
                        submenu: mainMenuItem.submenu.map(submenuItem => {
                            if (submenuItem.label === "Open recent") {
                                return {
                                    label: submenuItem.label,
                                    submenu: recentFiles.map(file => {
                                        return {
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

const refreshViewMenu = (selectedDir, indexPath, renderedIndexPath) => {

    const newAppMenuTemplate = appMenuTemplate.map(mainMenuItem => {
        if (mainMenuItem.label === "View") {
            return {
                label: 'View',
                submenu: [
                    {
                        label: 'Reload',
                        enabled: isDirectoryOpen,
                        accelerator: 'CmdOrCtrl+R',
                        role: "reload"
                    },
                    {
                        label: 'Toggle DevTools',
                        accelerator: 'CmdOrCtrl+Alt+I', // Shortcut for Windows/Linux
                        click: (menuItem, browserWindow) => {
                            if (browserWindow) browserWindow.webContents.toggleDevTools();
                        },
                    },
                    {
                        type: "separator"
                    },
                    {
                        label: 'Toggle overlay',
                        accelerator: 'CmdOrCtrl+Alt+V', // Shortcut for Windows/Linux
                        enabled: isDirectoryOpen && hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            showOverlayImage = !showOverlayImage;
                            renderTemplate(selectedDir, indexPath, renderedIndexPath);
                        },
                    },
                    {
                        label: 'Increase overlay opacity',
                        accelerator: 'CmdOrCtrl+Alt+P', // Shortcut for Windows/Linux
                        enabled: isDirectoryOpen && hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            overlaySize.overlayOpacity += 0.1
                            overlaySize.overlayOpacity = Math.min(overlaySize.overlayOpacity, 1);
                            renderTemplate(selectedDir, indexPath, renderedIndexPath);
                        },
                    },
                    {
                        label: 'Decrease overlay opacity',
                        accelerator: 'CmdOrCtrl+Alt+O', // Shortcut for Windows/Linux
                        enabled: isDirectoryOpen && hasOverlayImage,
                        click: (menuItem, browserWindow) => {
                            overlaySize.overlayOpacity -= 0.1
                            overlaySize.overlayOpacity = Math.max(overlaySize.overlayOpacity, 0);
                            renderTemplate(selectedDir, indexPath, renderedIndexPath);
                        },
                    },
                    {
                        type: "separator"
                    },
                    {
                        role: "zoomIn",
                        enabled: isDirectoryOpen,
                    },
                    {
                        role: "zoomOut",
                        enabled: isDirectoryOpen,
                    },
                    {
                        role: "resetZoom",
                        enabled: isDirectoryOpen,
                    },
                    {
                        type: "separator"
                    },
                    {
                        label: 'Media: screen',
                        enabled: false,
                        click: (menuItem, browserWindow) => {
                            console.log(menuItem.label);
                        },
                    },
                    {
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
                        label: 'Show PDF',
                        enabled: isDirectoryOpen && currentView.value !== "PDF",
                        click: (menuItem, browserWindow) => {
                            currentView.value = "PDF";
                            renderPdf(renderedIndexPath);
                            refreshViewMenu(selectedDir, indexPath, renderedIndexPath)
                            console.log(menuItem.label);
                        },
                    },
                    {
                        label: 'Show HTML',
                        enabled: isDirectoryOpen && currentView.value !== "HTML",
                        click: (menuItem, browserWindow) => {
                            currentView.value = "HTML";
                            renderTemplate(selectedDir, indexPath, renderedIndexPath);
                            refreshViewMenu(selectedDir, indexPath, renderedIndexPath);
                            console.log(menuItem.label);
                        },
                    },
                    {
                        label: 'Toggle view',
                        enabled: isDirectoryOpen,
                        accelerator: 'CmdOrCtrl+Alt+T',
                        click: (menuItem, browserWindow) => {
                            currentView.toggle(selectedDir, indexPath, renderedIndexPath);
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
