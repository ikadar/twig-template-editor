const { dialog } = require('electron');
const path = require("path");
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const Twig = require('twig');
const Overlay = require('./overlay');
const TestData = require('./test-data');

class Template {
    constructor(mainWindow) {
        this.directoryPath = null;
        this.indexPath = null;
        this.renderedIndexPath = null;
        this.mainWindow = mainWindow;
        this.overlay = new Overlay();
        this.testData = new TestData();
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
}

module.exports = Template; 