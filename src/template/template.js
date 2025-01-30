const { dialog } = require('electron');
const path = require("path");
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const Twig = require('twig');
const Overlay = require('./overlay');
const TestData = require('./test-data');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const os = require('os');
const fetch = require('node-fetch');
const { ipcMain } = require('electron');

class Template {
    constructor(mainWindow) {
        this.directoryPath = null;
        this.indexPath = null;
        this.renderedIndexPath = null;
        this.mainWindow = mainWindow;
        this.overlay = new Overlay();
        this.testData = new TestData();
        this._isDirectoryOpen = false;
        this._currentView = "HTML";
        this.latestTag = null;

        // Call getLatestTag immediately
        this.getLatestTag("ikadar", "prince-scripts")
            .catch(err => {
                console.error('Error getting latest tag:', err);
            });

        // Set up IPC listener
        ipcMain.on('send-value', (event, value) => {
            this.updateOverlaySize(value);
        });
    }

    updateOverlaySize(newValues) {
        this.overlay.updateSize(newValues);
    }

    increaseOverlayOpacity() {
        this.overlay.increaseOpacity();
    }

    decreaseOverlayOpacity() {
        this.overlay.decreaseOpacity();
    }

    checkOverlayImage() {
        return this.overlay.checkImage(this.directoryPath);
    }

    toggleOverlay() {
        return this.overlay.toggle();
    }

    get hasOverlayImage() {
        return this.overlay.hasOverlayImage;
    }

    async readTestDataFiles() {
        return this.testData.readFiles(this.directoryPath);
    }

    selectTestFile(label) {
        this.testData.selectFile(label);
    }

    async toggleTestFile() {
        return this.testData.toggle();
    }

    get testFiles() {
        return {
            files: this.testData.files,
            selectedTestFile: this.testData.selectedTestFile,
            selectedTestFileIndex: this.testData.selectedTestFileIndex
        };
    }

    render() {
        return JSDOM.fromFile(this.indexPath)
            .then(dom => {
                const document = dom.window.document;
                const bodyElement = document.getElementsByTagName("body")[0];

                // Add squeeze script
                const additionalScriptElement = document.createElement("script");
                additionalScriptElement.src = `${__dirname}/static/squeeze.js`;
                bodyElement.appendChild(additionalScriptElement);

                // Use overlay's appendToDOM method
                this.overlay.appendToDOM(document, __dirname);

                return this.testData.read(this.directoryPath)
                    .then(result => result.error ? {} : result.data)
                    .then(testData => {
                        const renderedContent = this.renderTwig(dom.serialize(), testData);
                        if (!renderedContent) {
                            throw new Error('Failed to render template');
                        }
                        return this.writeRendered(renderedContent);
                    });
            })
            .then(() => {
                this.mainWindow.loadFile(this.renderedIndexPath);
            })
            .catch(err => {
                console.error('Error rendering template:', err);
                dialog.showErrorBox('Render Error', `Failed to render template: ${err.message}`);
                throw err;
            });
    }

    renderTwig(template, data) {
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
            return twig.render(data);
        } catch (err) {
            dialog.showErrorBox('Twig compile error', err.message);
            return null;
        }
    }

    writeRendered(renderedContent) {
        return fs.promises.writeFile(this.renderedIndexPath, renderedContent);
    }

    setDirectory(dirPath) {
        this.directoryPath = dirPath;
        this.indexPath = path.join(dirPath, "index.html");
        this.renderedIndexPath = path.join(dirPath, "__index.html");
    }

    hasIndex() {
        return fs.existsSync(this.indexPath);
    }

    openDirectory(selectedDir) {
        this.setDirectory(selectedDir);

        if (!this.hasIndex()) {
            console.error('index.html not found in the selected directory');
            dialog.showErrorBox('Error', 'No index.html found in the selected directory.');
            return;
        }

        this.isDirectoryOpen = true;
        
        return this.readTestDataFiles()
            .then(() => this.appMenu.refreshTestMenu())
            .then(() => this.appMenu.addRecentPath(this.directoryPath))
            .then(() => {
                this.checkOverlayImage();
                this.render();
                if (this.watcher) {
                    console.log('Stopping the watcher...');
                    this.watcher.close();
                }
                this.watcher = this.watchDirectory(this.directoryPath);
                this.appMenu.refreshViewMenu();
            })
            .catch(err => {
                console.error('Error in openDirectory:', err);
                dialog.showErrorBox('Error', 'Failed to open directory: ' + err.message);
            });
    }

    setAppMenu(appMenu) {
        this.appMenu = appMenu;
    }

    get isDirectoryOpen() {
        return this._isDirectoryOpen || false;
    }

    set isDirectoryOpen(value) {
        this._isDirectoryOpen = value;
    }

    watchDirectory(selectedDir) {
        console.log('Starting the watcher...');

        const watcher = chokidar.watch(selectedDir, {
            ignored: (path) => {
                const parts = path.split('/');
                const isDotted = parts.some((part) => part.startsWith('.'));
                return isDotted || path === this.renderedIndexPath;
            },
            persistent: true,
            ignoreInitial: true,
            depth: Infinity,
        });

        watcher.on('change', () => {
            this.render();
        });

        return watcher;
    }

    selectDirectory() {
        dialog.showOpenDialog({
            properties: ['openDirectory']
        }).then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                this.openDirectory(result.filePaths[0]);
            }
        }).catch(err => {
            console.error('Error selecting directory:', err);
            dialog.showErrorBox('Error', 'Failed to select directory: ' + err.message);
        });
    }

    renderPdf() {
        const outputPath = path.join(os.tmpdir(), 'template-editor-output.pdf');
        exec(`prince -v -j -o '${outputPath}' '${this.renderedIndexPath}'`, (error, stdout, stderr) => {
            if (error) {
                console.error('Prince XML is not installed or not in PATH.');
                return;
            }
            console.log(stdout.trim());
            this.mainWindow.loadFile(outputPath);
        });
    }

    get currentView() {
        return this._currentView;
    }

    setView(view) {
        this._currentView = view;
        if (view === "HTML") {
            this.render();
        } else {
            this.renderPdf();
        }
    }

    toggleView() {
        this.setView(this._currentView === "HTML" ? "PDF" : "HTML");
    }

    async getLatestTag(username, repo) {
        const url = `https://api.github.com/repos/${username}/${repo}/tags`;
        const response = await fetch(url);
        const tags = await response.json();

        if (tags.length > 0) {
            this.latestTag = `v${tags[0].name}`;
            return this.latestTag;
        } else {
            this.latestTag = null;
            return null;
        }
    }
}

module.exports = Template; 