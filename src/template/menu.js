const { Menu } = require('electron');
const path = require('path');
const fs = require('fs');

class AppMenu {
    constructor(app, template, config) {

        this.app = app;
        this.template = template;
        this.config = config;
        this.menuTemplate = null;
        this.currentView = "HTML";
    }

    createInitialTemplate() {
        let menuTemplate = [
            {
                id: 'fileMenu',
                label: "File",
                submenu: [
                    {
                        id: 'openDirectory',
                        label: "Open Directory",
                        click: () => this.template.selectDirectory(),
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
                submenu: this.createViewSubmenu(),
            },
            {
                id: 'testMenu',
                label: 'Test',
                submenu: [
                    {
                        id: 'test.none',
                        isTestFile: true,
                        label: 'None',
                        click: (menuItem) => {
                            console.log(menuItem.label);
                        },
                    },
                    {type: "separator"},
                    {
                        id: 'toggleTest',
                        label: 'Toggle test',
                        enabled: this.template.isDirectoryOpen,
                        accelerator: 'CmdOrCtrl+Alt+M',
                        click: async () => {
                            await this.template.toggleTestFile();
                            this.template.render();
                            await this.refreshTestMenu();
                        }
                    },
                ],
            },
        ];

        if (process.platform === 'darwin') {
            menuTemplate.unshift(this.createMacAppMenu());
        }

        this.menuTemplate = menuTemplate;
        return menuTemplate;
    }

    createMacAppMenu() {
        return {
            id: 'appMenu',
            label: this.app.name,
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
        };
    }

    createViewSubmenu() {
        return [
            {
                id: 'view.reload',
                label: 'Reload',
                enabled: this.template.isDirectoryOpen,
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
                enabled: this.template.isDirectoryOpen && this.template.hasOverlayImage,
                click: () => {
                    this.template.toggleOverlay();
                    this.template.render();
                },
            },
            {
                id: 'increaseOverlayOpacity',
                label: 'Increase overlay opacity',
                accelerator: 'CmdOrCtrl+Alt+P',
                enabled: this.template.isDirectoryOpen && this.template.hasOverlayImage,
                click: () => {
                    this.template.increaseOverlayOpacity();
                    this.template.render();
                },
            },
            {
                id: 'decreaseOverlayOpacity',
                label: 'Decrease overlay opacity',
                accelerator: 'CmdOrCtrl+Alt+O',
                enabled: this.template.isDirectoryOpen && this.template.hasOverlayImage,
                click: () => {
                    this.template.decreaseOverlayOpacity();
                    this.template.render();
                },
            },
            {
                type: "separator"
            },
            {
                id: 'zoomIn',
                role: "zoomIn",
                enabled: this.template.isDirectoryOpen,
            },
            {
                id: 'zoomOut',
                role: "zoomOut",
                enabled: this.template.isDirectoryOpen,
            },
            {
                id: 'resetZoom',
                role: "resetZoom",
                enabled: this.template.isDirectoryOpen,
            },
            {
                type: "separator"
            },
            {
                id: 'mediaScreen',
                label: 'Media: screen',
                enabled: false,
                click: (menuItem) => {
                    console.log(menuItem.label);
                },
            },
            {
                id: 'mediaPrint',
                label: 'Media: print',
                enabled: false,
                click: (menuItem) => {
                    console.log(menuItem.label);
                },
            },
            {
                type: "separator"
            },
            {
                id: 'showPdf',
                label: 'Show PDF',
                enabled: this.template.isDirectoryOpen && this.currentView !== "PDF",
                click: (menuItem) => {
                    this.currentView = "PDF";
                    this.template.renderPdf();
                    this.refreshViewMenu();
                },
            },
            {
                id: 'showHtml',
                label: 'Show HTML',
                enabled: this.template.isDirectoryOpen && this.currentView !== "HTML",
                click: (menuItem) => {
                    this.currentView = "HTML";
                    this.template.render();
                    this.refreshViewMenu();
                },
            },
            {
                id: 'toggleView',
                label: 'Toggle view',
                enabled: this.template.isDirectoryOpen,
                accelerator: 'CmdOrCtrl+Alt+T',
                click: () => {
                    this.currentView = (this.currentView === "HTML") ? "PDF" : "HTML";
                    this.refreshViewMenu();
                    if (this.currentView === "HTML") {
                        this.template.render();
                    } else {
                        this.template.renderPdf();
                    }
                },
            },
        ];
    }

    createAppMenu(menuTemplate) {
        this.menuTemplate = menuTemplate;
        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
    }

    updateMenuItem(id, updates) {
        function recursiveUpdate(items) {
            return items.map(item => {
                if (item.id === id) {
                    return { ...item, ...updates };
                }
                if (item.submenu) {
                    return { ...item, submenu: recursiveUpdate(item.submenu) };
                }
                return item;
            });
        }

        this.menuTemplate = recursiveUpdate(this.menuTemplate);
        this.createAppMenu(this.menuTemplate);
    }

    getSubmenu(id) {
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

        return recursiveFind(this.menuTemplate);
    }

    async refreshTestMenu() {
        try {
            let newTestSubmenu = this.template.testFiles.files.map(file => {
                return {
                    id: `test.${file}`,
                    isTestFile: true,
                    label: file,
                    click: (menuItem) => {
                        this.template.selectTestFile(menuItem.label);
                        this.template.render();
                    }
                };
            });

            this.updateMenuItem("toggleTest", {enabled: newTestSubmenu.length > 0});
            let currentTestSubmenu = this.getSubmenu("testMenu").filter(item => !item?.isTestFile);
            newTestSubmenu = [...newTestSubmenu, ...currentTestSubmenu];
            
            this.updateMenuItem("testMenu", {
                submenu: newTestSubmenu
            });
        } catch (err) {
            console.error('Error reading directory:', err);
        }
    }

    refreshViewMenu() {
        const viewSubmenu = this.createViewSubmenu();
        this.updateMenuItem("viewMenu", {
            submenu: viewSubmenu
        });
    }

    refreshOpenRecentMenu() {
        return this.loadRecentFiles()
            .then(recentFiles => {
                const recentSubmenu = recentFiles.map(file => {
                    return {
                        id: `recent.${file}`,
                        label: file,
                        click: () => {
                            this.template.openDirectory(file);
                        }
                    }
                });

                this.updateMenuItem("openRecent", {
                    submenu: recentSubmenu
                });
            })
            .catch(err => {
                console.error('Error refreshing recent menu:', err);
            });
    }

    loadRecentFiles() {
        const recentFilesPath = path.join(this.app.getPath('userData'), 'recent-files.json');
        
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
            return Promise.resolve([]);
        }
    }

    addRecentPath(dirPath) {
        const recentFilesPath = path.join(this.app.getPath('userData'), 'recent-files.json');
        
        return this.loadRecentFiles()
            .then(recentFiles => {
                recentFiles.unshift(dirPath);
                const uniqueRecentFiles = [...new Set(recentFiles)];
                const trimmedFiles = uniqueRecentFiles.slice(0, this.config.MAX_RECENT_FILES);
                
                return fs.promises.writeFile(recentFilesPath, JSON.stringify(trimmedFiles))
                    .then(() => this.refreshOpenRecentMenu());
            })
            .catch(err => {
                console.error('Error adding recent path:', err);
            });
    }
}

module.exports = AppMenu; 