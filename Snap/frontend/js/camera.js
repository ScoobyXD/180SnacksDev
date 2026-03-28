/**
 * Snap — Camera Module
 * ====================
 * Handles the smartphone camera functionality:
 * - Requesting camera permission via getUserMedia API
 * - Displaying the live viewfinder
 * - Capturing photos at full resolution
 * - Returning photos as base64-encoded JPEG data
 * 
 * The camera uses the rear-facing camera by default (facingMode: "environment")
 * since users are photographing products on shelves, not taking selfies.
 * 
 * No compression is applied — full resolution images are captured.
 * Compression will only be added if upload speeds become a problem (see Context.md).
 */

/**
 * Initialize the camera and start the live viewfinder.
 * 
 * @param {HTMLVideoElement} videoElement - The <video> element to display the viewfinder in
 * @returns {MediaStream} The active camera stream (needed for cleanup)
 * @throws {Error} If camera permission is denied or unavailable
 */
export async function initCamera(videoElement) {
    try {
        // Request the rear camera at the highest available resolution
        // "environment" = rear camera on phones (for photographing products)
        // "user" = front camera (selfie camera — not what we want)
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 4096 },   // Request highest resolution available
                height: { ideal: 2160 },  // The browser will give the closest match
            },
            audio: false // No audio needed
        });

        videoElement.srcObject = stream;
        await videoElement.play();

        console.log('[Camera] Initialized successfully');
        
        // Log the actual resolution we got
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log(`[Camera] Resolution: ${settings.width}x${settings.height}`);

        return stream;

    } catch (error) {
        if (error.name === 'NotAllowedError') {
            throw new Error('Camera permission denied. Please allow camera access and try again.');
        } else if (error.name === 'NotFoundError') {
            throw new Error('No camera found on this device.');
        } else {
            throw new Error(`Camera error: ${error.message}`);
        }
    }
}


/**
 * Capture a photo from the live viewfinder.
 * 
 * Takes the current frame from the video element, draws it onto a canvas
 * at full resolution, and exports it as a base64 JPEG string.
 * 
 * NO COMPRESSION is applied. The image is exported at maximum JPEG quality (1.0).
 * See Context.md — compression is deferred until proven necessary.
 * 
 * @param {HTMLVideoElement} videoElement - The video element with the live camera feed
 * @returns {string} Base64-encoded JPEG image data (without the data:image/jpeg;base64, prefix)
 */
export function capturePhoto(videoElement) {
    // Create a canvas at the exact resolution of the video feed
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    // Draw the current video frame onto the canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // Export as JPEG at maximum quality (1.0 = no quality loss)
    // The "data:image/jpeg;base64," prefix is stripped because the backend
    // expects raw base64 data without the data URL prefix
    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
    const base64Data = dataUrl.split(',')[1];

    console.log(`[Camera] Photo captured: ${canvas.width}x${canvas.height}, ${(base64Data.length * 0.75 / 1024).toFixed(0)} KB`);

    return base64Data;
}


/**
 * Stop the camera stream and release the hardware.
 * Call this when the user navigates away or the app is backgrounded.
 * 
 * @param {MediaStream} stream - The stream returned by initCamera()
 */
export function stopCamera(stream) {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        console.log('[Camera] Stream stopped');
    }
}
