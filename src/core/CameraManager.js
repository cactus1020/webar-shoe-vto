/**
 * CameraManager.js
 * Bulletproof iOS Safari & Android WebRTC Camera Manager.
 * Handles high-resolution wide-angle streams, user-gesture tokens,
 * video dimension readiness, and constraint fallbacks without artificial digital zoom.
 */
export class CameraManager {
  constructor() {
    this.videoElement = null;
    this.stream = null;
    this.facingMode = 'environment';
    this.width = 1280;
    this.height = 720;
    this.aspectRatio = 16 / 9;
    this.listeners = new Map();
    this.isReady = false;
    this.isStarting = false;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        try {
          cb(data);
        } catch (e) {
          console.error('[CameraManager] Listener error:', e);
        }
      }
    }
  }

  async init(videoElement) {
    if (!videoElement) {
      throw new Error('[CameraManager] HTMLVideoElement is required.');
    }
    this.videoElement = videoElement;

    // Strict iOS Safari video element requirements
    this.videoElement.setAttribute('playsinline', 'true');
    this.videoElement.setAttribute('webkit-playsinline', 'true');
    this.videoElement.setAttribute('autoplay', 'true');
    this.videoElement.setAttribute('muted', 'true');
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;
    this.videoElement.autoplay = true;
    this.videoElement.controls = false;

    return this.startCamera(this.facingMode);
  }

  async startCamera(facingMode = 'environment') {
    if (this.isStarting) {
      console.warn('[CameraManager] Camera is already starting, skipping concurrent request.');
      return this.videoElement;
    }

    this.isStarting = true;
    this.stopCamera();
    this.facingMode = facingMode;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.isStarting = false;
      const error = new Error('Camera access requires HTTPS or is not supported in this browser.');
      this.emit('error', error);
      throw error;
    }

    // High-resolution wide field-of-view camera constraints
    // Avoids artificial sensor center-cropping on iPhone / Android
    const constraintOptions = [
      {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1920, min: 1024 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 60, min: 30 }
        }
      },
      {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      {
        audio: false,
        video: {
          facingMode: this.facingMode
        }
      },
      {
        audio: false,
        video: true
      }
    ];

    let lastError = null;
    let stream = null;

    for (const constraints of constraintOptions) {
      try {
        console.log('[CameraManager] Requesting stream with constraints:', constraints);
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        console.warn('[CameraManager] Constraint failed:', constraints, err);
        lastError = err;
      }
    }

    if (!stream) {
      this.isStarting = false;
      const error = lastError || new Error('Failed to acquire camera stream.');
      this.emit('error', error);
      throw error;
    }

    this.stream = stream;
    this.videoElement.srcObject = this.stream;

    try {
      await this.videoElement.play();
    } catch (playErr) {
      console.warn('[CameraManager] play() call note:', playErr);
    }

    await this.waitForVideoReady();

    this.updateDimensions();
    this.isReady = true;
    this.isStarting = false;

    if (this.facingMode === 'user') {
      this.videoElement.classList.add('mirrored');
    } else {
      this.videoElement.classList.remove('mirrored');
    }

    this.emit('ready', {
      width: this.width,
      height: this.height,
      aspectRatio: this.aspectRatio,
      facingMode: this.facingMode
    });

    return this.videoElement;
  }

  async waitForVideoReady() {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.videoElement && this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
          return true;
        }
        return false;
      };

      if (checkReady()) {
        resolve();
        return;
      }

      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      const interval = setInterval(() => {
        if (checkReady()) {
          clearInterval(interval);
          done();
        }
      }, 40);

      this.videoElement.addEventListener('loadedmetadata', done, { once: true });
      this.videoElement.addEventListener('loadeddata', done, { once: true });
      this.videoElement.addEventListener('canplay', done, { once: true });
      this.videoElement.addEventListener('playing', done, { once: true });

      setTimeout(() => {
        clearInterval(interval);
        done();
      }, 1500);
    });
  }

  async flipCamera() {
    const nextMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.startCamera(nextMode);
    this.emit('flipped', { facingMode: this.facingMode });
    return this.facingMode;
  }

  stopCamera() {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (e) {
        console.warn('[CameraManager] Track stop error:', e);
      }
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isReady = false;
  }

  updateDimensions() {
    if (this.videoElement && this.videoElement.videoWidth && this.videoElement.videoHeight) {
      this.width = this.videoElement.videoWidth;
      this.height = this.videoElement.videoHeight;
      this.aspectRatio = this.width / this.height;
      this.emit('dimensionsChange', {
        width: this.width,
        height: this.height,
        aspectRatio: this.aspectRatio
      });
    }
  }

  getDimensions() {
    return {
      width: this.width,
      height: this.height,
      aspectRatio: this.aspectRatio,
      videoWidth: this.videoElement && this.videoElement.videoWidth ? this.videoElement.videoWidth : this.width,
      videoHeight: this.videoElement && this.videoElement.videoHeight ? this.videoElement.videoHeight : this.height
    };
  }

  isFacingUser() {
    return this.facingMode === 'user';
  }
}
