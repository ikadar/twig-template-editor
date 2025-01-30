const fs = require('fs');

class Overlay {
    constructor() {
        this.hasOverlayImage = false;
        this.showOverlayImage = false;
        this.size = {
            overlayLeft: undefined,
            overlayTop: undefined,
            overlayWidth: undefined,
            overlayHeight: undefined,
            overlayOpacity: 0.3  // Default opacity
        };
    }

    updateSize(newValues) {
        this.size = {...this.size, ...newValues};
    }

    increaseOpacity() {
        this.size.overlayOpacity += 0.1;
        this.size.overlayOpacity = Math.min(this.size.overlayOpacity, 1);
    }

    decreaseOpacity() {
        this.size.overlayOpacity -= 0.1;
        this.size.overlayOpacity = Math.max(this.size.overlayOpacity, 0);
    }

    checkImage(directoryPath) {
        console.log(`${directoryPath}/img/template-overlay.png`);
        this.hasOverlayImage = fs.existsSync(`${directoryPath}/img/template-overlay.png`);
        return this.hasOverlayImage;
    }

    toggle() {
        console.log("toggleOverlay2");
        console.log(this.hasOverlayImage);
        this.showOverlayImage = !this.showOverlayImage && this.hasOverlayImage;
        return this.showOverlayImage;
    }

    appendToDOM(document, __dirname) {
        if (!this.showOverlayImage || !this.hasOverlayImage) {
            return;
        }

        const bodyElement = document.getElementsByTagName("body")[0];
        const headElement = document.getElementsByTagName("head")[0];

        // Add overlay script with settings
        const overlaySettingsScript = document.createElement("script");
        overlaySettingsScript.text = Object.keys(this.size).map(key => {
            const value = (typeof this.size[key] === "undefined") ? `${this.size[key]}` : `"${this.size[key]}"`;
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
        overlayScript.src = `${__dirname}/static/overlay.js`;
        bodyElement.appendChild(overlayScript);

        // Add overlay styles
        const overlayStyles = document.createElement("link");
        overlayStyles.rel = "stylesheet";
        overlayStyles.href = `${__dirname}/static/overlay.css`;
        headElement.appendChild(overlayStyles);
    }
}

module.exports = Overlay; 