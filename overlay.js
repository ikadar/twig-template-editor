// Test the electronAPI
if (!window.electronAPI) {
    console.error("electronAPI is not defined in this HTML context.");
}

const overlay = document.getElementById('editor-overlay');
const resizeHandle = overlay.querySelector('.resize-handle');

let isDragging = false;
let isResizing = false;
let offsetX, offsetY;
let aspectRatio = overlay.offsetWidth / overlay.offsetHeight; // Calculate initial aspect ratio

overlay.style.backgroundImage = 'url("./img/template-overlay.png")';

// Dragging logic
overlay.addEventListener('mousedown', (e) => {
    if (e.target === resizeHandle) return; // Skip if resizing
    isDragging = true;
    offsetX = e.clientX - overlay.offsetLeft;
    offsetY = e.clientY - overlay.offsetTop;

    overlay.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        overlay.style.left = `${e.clientX - offsetX}px`;
        overlay.style.top = `${e.clientY - offsetY}px`;

        // send values to main.js
        window.electronAPI.sendValueToMain({
            overlayLeft: overlay.style.left,
            overlayTop: overlay.style.top
        });

    } else if (isResizing) {
        const newWidth = e.clientX - overlay.offsetLeft;
        const newHeight = e.clientY - overlay.offsetTop;

        if (e.shiftKey) {
            // Proportional resizing
            if (newWidth / newHeight > aspectRatio) {
                // Constrain by height
                overlay.style.width = `${newHeight * aspectRatio}px`;
                overlay.style.height = `${newHeight}px`;
            } else {
                // Constrain by width
                overlay.style.width = `${newWidth}px`;
                overlay.style.height = `${newWidth / aspectRatio}px`;
            }
        } else {
            // Free resizing
            overlay.style.width = `${Math.max(newWidth, 20)}px`; // Minimum width: 20px
            overlay.style.height = `${Math.max(newHeight, 20)}px`; // Minimum height: 20px
        }

        window.electronAPI.sendValueToMain({
            overlayWidth: overlay.style.width,
            overlayHeight: overlay.style.height
        });

    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
    overlay.style.cursor = 'grab';
});

// Resizing logic
resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'se-resize'; // Change cursor during resize
    e.stopPropagation(); // Prevent triggering drag logic
    e.preventDefault(); // Prevent text selection or other default behaviors
});

function adjustOverlaySize(oTop, oLeft, oWidth, oHeight, oOpacity) {

    const bodyRect = document.body.getBoundingClientRect();

    overlay.style.position = 'absolute';
    overlay.style.top = (typeof oTop === "undefined") ? `${bodyRect.top}px` : `${oTop}`;
    overlay.style.left = (typeof oLeft === "undefined") ? `${bodyRect.left}px` : `${oLeft}`;
    overlay.style.width = (typeof oWidth === "undefined") ? `${bodyRect.width}px` : `${oWidth}`;
    overlay.style.height = (typeof oHeight === "undefined") ? `${bodyRect.height}px` : `${oHeight}`;

    overlay.style.opacity = (typeof oOpacity === "undefined") ? `0.3` : `${oOpacity}`;

    aspectRatio = overlay.offsetWidth / overlay.offsetHeight; // Update aspect ratio if size changes
}

// Adjust overlay size initially and on window resize
adjustOverlaySize(overlayTop, overlayLeft, overlayWidth, overlayHeight, overlayOpacity);
window.addEventListener('resize', adjustOverlaySize);
