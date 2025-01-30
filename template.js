const { dialog } = require('electron');
const path = require("path");
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const Twig = require('twig');

class Template {
    constructor(mainWindow) {
        this.directoryPath = null;
        this.indexPath = null;
        this.renderedIndexPath = null;
        this.mainWindow = mainWindow;
        this.hasOverlayImage = false;
        this.showOverlayImage = false;
        this.overlaySize = {
            overlayLeft: undefined,
            overlayTop: undefined,
            overlayWidth: undefined,
            overlayHeight: undefined,
            overlayOpacity: 0.3  // Default opacity
        };
    }

    updateOverlaySize(newValues) {
        this.overlaySize = {...this.overlaySize, ...newValues};
    }

    increaseOverlayOpacity() {
        this.overlaySize.overlayOpacity += 0.1;
        this.overlaySize.overlayOpacity = Math.min(this.overlaySize.overlayOpacity, 1);
    }

    decreaseOverlayOpacity() {
        this.overlaySize.overlayOpacity -= 0.1;
        this.overlaySize.overlayOpacity = Math.max(this.overlaySize.overlayOpacity, 0);
    }

    // Add method to check for overlay image
    checkOverlayImage() {
        this.hasOverlayImage = fs.existsSync(`${this.directoryPath}/img/template-overlay.png`);
        return this.hasOverlayImage;
    }

    toggleOverlay() {
        this.showOverlayImage = !this.showOverlayImage && this.hasOverlayImage;
        return this.showOverlayImage;
    }

    render(readTestData) {
        return JSDOM.fromFile(this.indexPath)
            .then(dom => {
                const document = dom.window.document;
                const bodyElement = document.getElementsByTagName("body")[0];
                const headElement = document.getElementsByTagName("head")[0];

                // Add squeeze script
                const additionalScriptElement = document.createElement("script");
                additionalScriptElement.src = `${__dirname}/squeeze.js`;
                bodyElement.appendChild(additionalScriptElement);

                if (this.showOverlayImage && this.hasOverlayImage) {
                    // Add overlay script with settings
                    const overlaySettingsScript = document.createElement("script");
                    overlaySettingsScript.text = Object.keys(this.overlaySize).map(key => {
                        const value = (typeof this.overlaySize[key] === "undefined") ? `${this.overlaySize[key]}` : `"${this.overlaySize[key]}"`;
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