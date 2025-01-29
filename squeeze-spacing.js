function calculateSqueezedLetterSpacing (element, maxWidthPt) {
    logInfo("--- CALCULATION STARTED");
    logInfo("");
    increaseIndentation();

    // Gather current info
    const text = element.textContent || "";

    console.log(element.textContent);
    console.log(element.textContent);
    console.log(element.innerHTML);

    const currentLetterSpacing = parseFloat(window.getComputedStyle(element).letterSpacing) || 0;
    const currentWidth = getElementBoxWidth(element); // width in points or px, depending on environment

    logInfo("maxWidthPt: " + maxWidthPt);
    logInfo("currentWidth: " + currentWidth);
    logInfo("text: " + (typeof text == "undefined"));
    logInfo("text: " + (typeof text == "string"));
    logInfo("text: " + (!!text));
    logInfo("text: " + ((!!text) ? "AAA" : "BBB"));
    logInfo("text length: " + ((!!text) ? text.length : 0));
    logInfo("currentLetterSpacing: " + currentLetterSpacing + "pt (assuming)");

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
    // for (const elementToSqueeze of elementsToSqueezeSpacing) {
    //     squeezeLetterSpacing(elementToSqueeze);
    // }
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

        element.style.letterSpacing = "0.1pt";
        element.style.maxWidth = "";
        element.style.whiteSpace = "nowrap"; // Prevent wrapping
    });
}

if (runsInPrince) {
    logInfo("--- STARTED");

    Prince.Log.info(typeof window);

    Prince.trackBoxes = true;

    prepareElementsForLetterSpacing();

    Prince.registerPostLayoutFunc(function () {
        squeezeAllLetterSpacing();
    });

    // Prince.addEventListener("complete", function () {
    //     logInfo("--- FROM COMPLETE");
    // }, false);
} else {
    prepareElementsForLetterSpacing();
    squeezeAllLetterSpacing();
}
