const indentIncrement = 4;
var indent = 0;
const debug = true;
const runsInPrince = (typeof Prince !== "undefined");

function logInfo (info) {
    if (debug) {
        if (runsInPrince) {
            Prince.Log.info("|" + getIndentation() + info);
        } else {
            console.log("|" + getIndentation() + info);
        }
    }
}

function getIndentation () {
    var indentation = "";
    for (var i=0; i<indent; i++) {
        indentation = indentation + " ";
    }

    return indentation;
}

function increaseIndentation () {
    indent += indentIncrement;
}

function decreaseIndentation () {
    indent -= indentIncrement;
}

function calculateSqueezedFontSize (maxFontSizePt, maxWidthPt, actualWidthPt, actualFontSizePt) {

    logInfo("--- FONT SIZE CALCULATION STARTED");
    logInfo("");
    increaseIndentation();

    const scale = maxWidthPt / actualWidthPt;
    const newFontSizePt = scale;

    logInfo("maxFontSizePt: " + maxFontSizePt);
    logInfo("actualFontSizePt: " + actualFontSizePt);
    logInfo("maxWidthPt: " + maxWidthPt);
    logInfo("actualWidthPt: " + actualWidthPt);
    logInfo("scale: " + scale);
    logInfo("NEW fontSize: " + newFontSizePt);
    logInfo("NEW fontSize: " + Math.min(newFontSizePt, maxFontSizePt));

    decreaseIndentation();

    logInfo("");
    logInfo("--- FONT SIZE CALCULATION ENDED");

    // return newFontSizePt;
    return Math.min(newFontSizePt, maxFontSizePt);
}

function getElementBoxWidth (el) {
    if (runsInPrince) {
        const boxes = el.getPrinceBoxes();
        return boxes[0].w;
    } else {
        console.log(el.clientWidth);
        return el.clientWidth;
    }
}

function squeeze (s) {
    logInfo("=== " + s.element.id + " ===");
    var newFontSizePt = calculateSqueezedFontSize(s.maxFontSizePt, s.maxWidthPt, getElementBoxWidth(s.element), s.element.style.fontSize);
    s.element.style.fontSize = newFontSizePt.toString() + "pt";
    s.element.style.maxWidth = s.maxWidth + "pt";
}

// get elements with squeeze and squeeze-[*] classes
function getElementsToSqueeze () {
    const squeezeElements = document.querySelectorAll('.squeeze');
    const squeezeElementsWithParams = [];

    // convert nodeList to array
    for (var i=0; i<squeezeElements.length; i++) {
        squeezeElementsWithParams.push(squeezeElements[i]);
    }

    return squeezeElementsWithParams;
}

function squeezeAll () {
    // prepareElements();
    for (var i in elementsToSqueeze) {
        squeeze(elementsToSqueeze[i]);
    }
}

const elementsToSqueeze = [];

function prepareElements () {
    const elements = getElementsToSqueeze();
    elements.map(function (element, index) {

        logInfo(element.id);

        const maxWidth = window.getComputedStyle(element).maxWidth;
        const maxFontSize = window.getComputedStyle(element).fontSize;

        if (!maxWidth || !maxFontSize || maxWidth === "none" || maxFontSize === "none") {
            return;
        }

        const maxWidthPt = convertToPt(maxWidth);
        const maxFontSizePt = convertToPt(maxFontSize);

        elementsToSqueeze[index] = {
            element: elements[index],
            maxWidthPt: maxWidthPt,
            maxFontSizePt: maxFontSizePt,
        };


        element.style.fontSize = "1pt";
        element.style.width = "";
        element.style.maxWidth = "";
        element.style.whiteSpace = "nowrap";

    });
}




///////////////////////////////////////////////

function calculateSqueezedLetterSpacing (element, maxWidthPt) {

    const dpi = (runsInPrince ? 1 : 0.74999943307122);

    logInfo("--- CALCULATION STARTED");
    logInfo("");
    increaseIndentation();

    maxWidthPt = maxWidthPt * dpi;

    // Gather current info
    const text = element.textContent || "";

    let currentLetterSpacing = parseFloat(window.getComputedStyle(element).letterSpacing) || 0;
    currentLetterSpacing = currentLetterSpacing * dpi;

    let currentWidth = getElementBoxWidth(element); // width in points or px, depending on environment
    currentWidth = currentWidth * dpi;

    logInfo("maxWidthPt: " + maxWidthPt);
    logInfo("currentWidth: " + currentWidth);
    logInfo("text: " + (typeof text == "undefined"));
    logInfo("text: " + (typeof text == "string"));
    logInfo("text: " + (!!text));
    logInfo("text: " + ((!!text) ? "AAA" : "BBB"));
    logInfo("text length: " + ((!!text) ? text.length : 0));
    logInfo("currentLetterSpacing: " + currentLetterSpacing + "pt (assuming)");
    logInfo("scale: " + (maxWidthPt - currentWidth));

    // If there is at least 2 characters, we have (text.length - 1) gaps
    let newLetterSpacing = currentLetterSpacing;
    if (text.length > 1) {
        const extraSpacing = (maxWidthPt - currentWidth) / (text.length - 1);
        newLetterSpacing = currentLetterSpacing + extraSpacing;
    }

    logInfo("newLetterSpacing: " + newLetterSpacing);
    decreaseIndentation();
    logInfo("");
    logInfo("--- CALCULATION ENDED");


    return newLetterSpacing;
}

function squeezeLetterSpacing(s) {
    logInfo("=== " + s.element.id + " ===");

    const originalLetterSpacing = parseFloat(window.getComputedStyle(s.element).letterSpacing) || 0;

    console.log("originalLetterSpacing: " + originalLetterSpacing);

    const newLetterSpacingPt = calculateSqueezedLetterSpacing(
        s.element,
        s.maxWidthPt,
        // getElementBoxWidth(s.element),
        // originalLetterSpacing
    );

    s.element.style.letterSpacing = newLetterSpacingPt.toString() + "pt";
    s.element.style.maxWidth = s.maxWidth + "pt";
}

// Adjust letter-spacing for all elements
function squeezeAllLetterSpacing() {
    for (var i in elementsToSqueezeSpacing) {
        squeezeLetterSpacing(elementsToSqueezeSpacing[i]);
    }
}

function getElementsToSqueezeLetterSpacing () {
    const squeezeElements = document.querySelectorAll('.squeeze-spacing');
    const squeezeElementsWithParams = [];

    // convert nodeList to array
    for (var i=0; i<squeezeElements.length; i++) {
        squeezeElementsWithParams.push(squeezeElements[i]);
    }

    return squeezeElementsWithParams;
}


const elementsToSqueezeSpacing = [];

// Preparation logic remains mostly the same
function prepareElementsForLetterSpacing() {
    console.log("----------------------- prepareElementsForLetterSpacing");
    const elements = getElementsToSqueezeLetterSpacing();
    elements.map(function (element, index) {
        logInfo(element.id);

        const maxWidth = window.getComputedStyle(element).maxWidth;

        if (!maxWidth || maxWidth === "none") {
            return;
        }

        const maxWidthPt = convertToPt(maxWidth);

        elementsToSqueezeSpacing[index] = {
            element: elements[index],
            maxWidthPt: maxWidthPt,
        };

        element.style.letterSpacing = "0.1px";
        element.style.maxWidth = "";
        element.style.whiteSpace = "nowrap"; // Prevent wrapping
    });
}

///////////////////////////////////////////////















if (runsInPrince) {
    logInfo("--- STARTED");

    Prince.Log.info(typeof window);

    Prince.trackBoxes = true;

    prepareElements();
    prepareElementsForLetterSpacing();

    Prince.registerPostLayoutFunc(function() {
        squeezeAll();
        squeezeAllLetterSpacing();
        // document.getElementById("job_title").style.fontSize = "32pt";
    });

    Prince.addEventListener("complete", function() {
        // logInfo("--- FROM COMPLETE");
    }, false);

} else {
    prepareElements();
    prepareElementsForLetterSpacing();

    squeezeAll();
    squeezeAllLetterSpacing();
}

/**
 * Converts a CSS size string to points (pt) with a customizable DPI.
 * If the size is unitless (e.g., "126"), it is treated as "126px".
 * @param {string} size - The CSS size string (e.g., "12pt", "20mm", "11px", or "126").
 * @returns {number} - The size converted to points (pt).
 */
function convertToPt(size) {

    // conversion fixed based on https://github.com/ArthurArakelyan/css-unit-converter-js/blob/main/src/converters.ts

    var dpi;
    if (runsInPrince) {
        dpi = 74.999943307122;
        // dpi = 72;
    } else {
        // dpi = 72;
        dpi = 74.999943307122;
        // dpi = 96;
    }

    const pointsPerInch = 72; // 1 inch = 72 points
    // const pointsPerInch = dpi; // 1 inch = 72 points
    const conversionFactors = {
        pt: 1,                         // 1 pt = 1 pt
        px: pointsPerInch / dpi,       // px to pt depends on DPI
        mm: 3.7795275591 * dpi / 100,  // 1 mm = 1 inch / 25.4
        // mm: pointsPerInch / 25.4,   // 1 mm = 1 inch / 25.4
        cm: pointsPerInch / 2.54,      // 1 cm = 1 inch / 2.54
        in: 96 * dpi / 100,            // 1 inch = 72 pt
        // in: pointsPerInch,          // 1 inch = 72 pt
        pc: 16 * dpi,                  // 1 pica (pc) = 12 pt
        em: 16 * dpi,                  // Assuming 1 em ≈ 12 pt (adjust if needed)
        rem: 16 * dpi                  // Assuming 1 rem ≈ 12 pt (adjust if needed)
    };

    // Extract the numeric value and the unit from the size string
    const match = size.match(/^([\d.]+)([a-z%]*)$/i);

    if (!match) {
        throw new Error("Invalid size format: " + size);
    }

    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();

    // If no unit is provided, assume 'px' by default
    if (!unit) {
        unit = "px";
    }

    if (!conversionFactors[unit]) {
        throw new Error("Unsupported unit: " + unit);
    }

    logInfo("IN: " + size);
    logInfo("UOT: " + value * conversionFactors[unit]);

    return value * conversionFactors[unit];
}
