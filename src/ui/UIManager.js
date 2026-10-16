/**
 * UIManager.js
 * Manages mobile-first UI interactions, bottom shoe carousel,
 * telemetry HUD (FPS, tracking indicators), photo snapshot capture, and modals.
 */
import { SNEAKER_STYLES } from '../models/ProceduralSneaker.js';

export class UIManager {
  constructor() {
    this.elements = {};
    this.listeners = new Map();
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 60;
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
        cb(data);
      }
    }
  }

  init() {
    // Cache DOM Elements
    this.elements = {
      loader: document.getElementById('loader-overlay'),
      loaderText: document.getElementById('loader-text'),
      carouselTrack: document.getElementById('carousel-track'),
      shoeName: document.getElementById('shoe-name'),
      shoeTagline: document.getElementById('shoe-tagline'),
      shoePrice: document.getElementById('shoe-price'),
      aiStatusBadge: document.getElementById('ai-status-badge'),
      aiStatusText: document.getElementById('ai-status-text'),
      modelReleaseText: document.getElementById('model-release-text'),
      btnAlignFeet: document.getElementById('btn-align-feet'),
      leftDot: document.getElementById('left-foot-dot'),
      rightDot: document.getElementById('right-foot-dot'),
      fpsValue: document.getElementById('fps-value'),
      biometricPill: document.getElementById('biometric-size-pill'),
      biometricText: document.getElementById('biometric-size-value'),
      guidance: document.getElementById('guidance-container'),
      btnFlip: document.getElementById('btn-flip-camera'),
      btnSizeScan: document.getElementById('btn-size-scan'),
      btnOccluder: document.getElementById('btn-toggle-occluder'),
      btnCapture: document.getElementById('btn-capture'),
      btnInfo: document.getElementById('btn-info'),
      shutterFlash: document.getElementById('shutter-flash'),
      glbInput: document.getElementById('glb-file-input'),
      // Modals
      permissionModal: document.getElementById('permission-modal'),
      snapshotModal: document.getElementById('snapshot-modal'),
      infoModal: document.getElementById('info-modal'),
      sizeScanModal: document.getElementById('size-scan-modal'),
      snapshotImg: document.getElementById('snapshot-preview-img'),
      btnDownloadSnapshot: document.getElementById('btn-download-snapshot'),
      btnCloseSnapshot: document.getElementById('btn-close-snapshot'),
      btnRetryPermission: document.getElementById('btn-retry-permission'),
      btnCloseInfo: document.getElementById('btn-close-info'),
      btnCloseSizeScan: document.getElementById('btn-close-size-scan'),
      btnRestartSizeScan: document.getElementById('btn-restart-size-scan'),
      btnBeginSizeScan: document.getElementById('btn-begin-size-scan'),
      calibrationProgress: document.getElementById('calibration-progress'),
      calibrationInstruction: document.getElementById('calibration-instruction'),
      calibrationResult: document.getElementById('calibration-result')
    };
    this.elements.measurementCanvas = document.getElementById('measurement-canvas');
    this.elements.sizeRecommendation = document.getElementById('size-recommendation');

    this.renderCarousel();
    this.bindEvents();
    return this;
  }

  renderCarousel() {
    const track = this.elements.carouselTrack;
    if (!track) return;

    track.innerHTML = '';
    const styles = Object.values(SNEAKER_STYLES);

    styles.forEach((style, index) => {
      const card = document.createElement('div');
      card.className = 'shoe-capsule interactive ' + (index === 0 ? 'active' : '');
      card.dataset.styleId = style.id;

      // Color swatch preview
      const c = style.colors;
      const soleHex = '#' + (c.midsole || 0x18191e).toString(16).padStart(6, '0');
      const upperHex = '#' + (c.upper || 0xffffff).toString(16).padStart(6, '0');
      const accentVal = c.buckle !== undefined ? c.buckle : (c.accents !== undefined ? c.accents : (c.accent !== undefined ? c.accent : 0xd4af37));
      const accentHex = '#' + accentVal.toString(16).padStart(6, '0');

      card.innerHTML = [
        '<div class="capsule-swatch-ring" style="background: linear-gradient(135deg, ' + upperHex + ' 50%, ' + soleHex + ' 50%); border-color: ' + accentHex + ';"></div>',
        '<div class="capsule-text-col">',
        '  <span class="capsule-title">' + style.name.split(' ')[0] + ' ' + (style.name.split(' ')[1] || '') + '</span>',
        '  <span class="capsule-price">' + style.price + '</span>',
        '</div>'
      ].join('');

      card.addEventListener('click', () => {
        this.selectStyle(style.id);
      });

      track.appendChild(card);
    });

    const showcase = document.createElement('button');
    showcase.className = 'shoe-capsule interactive';
    showcase.type = 'button';
    showcase.innerHTML = '<span class="capsule-text-col"><span class="capsule-title">Studio Sneaker</span><span class="capsule-price">Textured 3D · Shopify</span></span>';
    showcase.addEventListener('click', () => this.emit('loadShowcase'));
    track.appendChild(showcase);

    // Add "+ 3D GLB" upload capsule
    const customCard = document.createElement('div');
    customCard.className = 'shoe-capsule custom-glb-capsule interactive';
    customCard.id = 'card-custom-glb';
    customCard.innerHTML = [
      '<div class="capsule-swatch-ring" style="background: rgba(0, 242, 254, 0.15); border-color: #00f2fe;">',
      '  <svg viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2.5" style="width:16px;height:16px;">',
      '    <path d="M12 5v14M5 12h14"/>',
      '  </svg>',
      '</div>',
      '<div class="capsule-text-col">',
      '  <span class="capsule-title">Custom</span>',
      '  <span class="capsule-price">.GLB</span>',
      '</div>'
    ].join('');

    customCard.addEventListener('click', () => {
      if (this.elements.glbInput) {
        this.elements.glbInput.click();
      }
    });
    track.appendChild(customCard);
  }

  bindEvents() {
    this.elements.btnAlignFeet.addEventListener('click', () => this.emit('alignFeet'));
    // Camera flip button
    if (this.elements.btnFlip) {
      this.elements.btnFlip.addEventListener('click', () => {
        this.emit('flipCamera');
      });
    }

    if (this.elements.btnSizeScan) {
      this.elements.btnSizeScan.addEventListener('click', () => {
        this.emit('startSizeScan');
      });
    }

    // Occluder debug toggle
    if (this.elements.btnOccluder) {
      this.elements.btnOccluder.addEventListener('click', () => {
        this.elements.btnOccluder.classList.toggle('active');
        this.emit('toggleOccluder');
      });
    }

    // Capture photo button
    if (this.elements.btnCapture) {
      this.elements.btnCapture.addEventListener('click', () => {
        this.emit('captureSnapshot');
      });
    }

    // GLB File Input
    if (this.elements.glbInput) {
      this.elements.glbInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.emit('loadCustomGLB', e.target.files[0]);
        }
      });
    }

    // Info modal
    if (this.elements.btnInfo) {
      this.elements.btnInfo.addEventListener('click', () => {
        this.showModal('infoModal');
      });
    }
    if (this.elements.btnCloseInfo) {
      this.elements.btnCloseInfo.addEventListener('click', () => {
        this.hideModal('infoModal');
      });
    }

    // Snapshot modal actions
    if (this.elements.btnCloseSnapshot) {
      this.elements.btnCloseSnapshot.addEventListener('click', () => {
        this.hideModal('snapshotModal');
      });
    }

    if (this.elements.btnCloseSizeScan) {
      this.elements.btnCloseSizeScan.addEventListener('click', () => {
        this.hideModal('sizeScanModal');
        this.isCalibrationActive = false;
        this.emit('cancelSizeScan');
      });
    }

    if (this.elements.btnRestartSizeScan) {
      this.elements.btnRestartSizeScan.addEventListener('click', () => {
        this.emit('restartSizeScan');
      });
    }

    if (this.elements.btnBeginSizeScan) {
      this.elements.btnBeginSizeScan.addEventListener('click', () => {
        this.emit('captureMeasurementFrame');
      });
    }
    document.getElementById('btn-undo-size-point').addEventListener('click', () => this.emit('undoMeasurementPoint'));
    this.elements.measurementCanvas.addEventListener('pointerdown', (event) => {
      if (!this.isCalibrationActive || !this.measurementFrame) return;
      const canvas = this.elements.measurementCanvas;
      const rect = canvas.getBoundingClientRect();
      this.emit('measurementPoint', {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      });
    });
    for (const [id, event] of [['measurement-photo-input', 'loadMeasurementPhoto'], ['size-chart-input', 'importSizeChart']]) {
      document.getElementById(id).addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.emit(event, file);
        e.target.value = '';
      });
    }

    // Permission retry
    if (this.elements.btnRetryPermission) {
      this.elements.btnRetryPermission.addEventListener('click', () => {
        this.hideModal('permissionModal');
        this.emit('retryCamera');
      });
    }
  }

  selectStyle(styleId) {
    const cards = document.querySelectorAll('.shoe-capsule');
    cards.forEach(c => {
      if (c.dataset.styleId === styleId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    const style = SNEAKER_STYLES[styleId];
    if (style) {
      this.updateShoeInfo(style.name, style.tagline, style.price);
    }
    this.emit('selectStyle', styleId);
  }

  updateShoeInfo(name, tagline, price) {
    if (this.elements.shoeName) this.elements.shoeName.textContent = name;
    if (this.elements.shoeTagline) this.elements.shoeTagline.textContent = tagline;
    if (this.elements.shoePrice) this.elements.shoePrice.textContent = price;
  }

  updateAIEngineStatus(statusText, statusType = 'active') {
    if (!this.elements.aiStatusBadge) {
      this.elements.aiStatusBadge = document.getElementById('ai-status-badge');
      this.elements.aiStatusText = document.getElementById('ai-status-text');
    }
    if (this.elements.aiStatusBadge && this.elements.aiStatusText) {
      this.elements.aiStatusText.textContent = statusText;
      this.elements.aiStatusBadge.className = `ai-status-badge ai-status-${statusType}`;
    }
  }

  updateModelRelease(release) {
    const element = this.elements.modelReleaseText;
    if (!release) {
      element.textContent = 'Model: লোড ব্যর্থ • Auto বন্ধ';
      element.dataset.modelId = '';
      return;
    }
    const date = new Date(release.trainedAt);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const builtAt = typeof __APP_BUILT_AT__ !== 'undefined' ? new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(__APP_BUILT_AT__)) : 'local';
    element.textContent = `Loaded: ${release.id} • Trained ${time} BDT • App build ${builtAt} BDT`;
    element.dataset.modelId = release.id;
    element.title = element.textContent;
  }

  setAlignmentHint(hint, manual) {
    this.alignmentHint = hint;
    this.elements.btnAlignFeet.textContent = manual ? 'Auto / reset alignment' : 'Align shoes';
  }

  updateHUD(leftFoot, rightFoot, calibratedMeasurement = null) {
    const isTracking = [leftFoot, rightFoot].some(foot => foot?.isTracked && !foot.isManualAnchor && foot.confidence >= 0.4 && foot.opacity > 0.4);

    const hintText = document.getElementById('hint-text');
    if (hintText && !this.isCalibrationActive) {
      if (this.alignmentHint) {
        hintText.textContent = this.alignmentHint;
      } else if (isTracking) {
        hintText.textContent = 'AI preview • পায়ের অবস্থান মিলিয়ে দেখুন';
      } else {
        hintText.textContent = 'পা দেখা যাচ্ছে না? Tap to track চেষ্টা করুন';
      }
    }

    // Only show dimensions after the user has completed reference-card calibration.
    if (this.elements.biometricPill && this.elements.biometricText) {
      if (calibratedMeasurement) {
        this.elements.biometricPill.style.display = 'inline-flex';
        this.elements.biometricText.textContent = `Measured: ${calibratedMeasurement.lengthMm} mm × ${calibratedMeasurement.widthMm} mm`;
      } else {
        this.elements.biometricPill.style.display = 'none';
      }
    }

    // Guidance visibility (fade out when at least one foot is tracked)
    if (this.elements.guidance) {
      if (isTracking) {
        this.elements.guidance.classList.add('faded');
      } else {
        this.elements.guidance.classList.remove('faded');
      }
    }
  }

  triggerShutterFlash() {
    const flash = this.elements.shutterFlash;
    if (!flash) return;
    flash.classList.add('flashing');
    setTimeout(() => {
      flash.classList.remove('flashing');
    }, 180);
  }

  showSnapshotPreview(dataUrl) {
    if (this.elements.snapshotImg) {
      this.elements.snapshotImg.src = dataUrl;
    }
    if (this.elements.btnDownloadSnapshot) {
      this.elements.btnDownloadSnapshot.onclick = () => {
        const link = document.createElement('a');
        link.download = 'webar-shoe-tryon-' + Date.now() + '.png';
        link.href = dataUrl;
        link.click();
      };
    }
    this.showModal('snapshotModal');
  }

  showCalibration(state) {
    this.isCalibrationActive = state.status === 'collecting';
    this.renderCalibrationState(state);
    this.showModal('sizeScanModal');
  }

  updateCalibration(state) {
    this.isCalibrationActive = state.status === 'collecting';
    this.renderCalibrationState(state);
    if (state.status !== 'collecting') {
      this.showModal('sizeScanModal');
    }
  }

  renderCalibrationState(state) {
    const canvas = this.elements.measurementCanvas;
    if (canvas && this.measurementFrame) {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.measurementFrame, 0, 0);
      (state.points || []).forEach((point, index) => {
        ctx.fillStyle = '#00f2fe';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(String(index + 1), point.x + 12, point.y);
      });
    }
    if (this.elements.btnBeginSizeScan) this.elements.btnBeginSizeScan.hidden = state.status === 'complete';
    if (this.elements.calibrationProgress) {
      this.elements.calibrationProgress.textContent = state.status === 'collecting'
        ? `ধাপ ${state.pointCount + 1} / ${state.totalPoints}`
        : state.status === 'complete' ? 'মাপ নেওয়া হয়েছে' : state.status === 'idle' ? 'ছবি নিন বা আপলোড করুন' : 'মাপ আবার নিন';
    }
    if (this.elements.calibrationInstruction) {
      this.elements.calibrationInstruction.textContent = state.error || state.instruction;
    }
    if (this.elements.calibrationResult) {
      if (state.measurement) {
        const result = state.measurement;
        this.elements.calibrationResult.hidden = false;
        this.elements.calibrationResult.textContent = `পায়ের মাপ: ${result.lengthMm} mm লম্বা × ${result.widthMm} mm চওড়া। ছবির resolution: ${result.quality === 'good' ? 'যথেষ্ট' : 'আরও পরিষ্কার ছবি দরকার'}। মাপের নির্ভুলতা এখনও মাঠপর্যায়ে যাচাই হয়নি।`;
      } else {
        this.elements.calibrationResult.hidden = true;
        this.elements.calibrationResult.textContent = '';
      }
    }
  }

  setMeasurementFrame(source) {
    const canvas = this.elements.measurementCanvas;
    const width = source.videoWidth || source.naturalWidth || source.width;
    const height = source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height) throw new Error('প্রথমে camera চালু করুন বা পায়ের ছবি আপলোড করুন।');
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    this.measurementFrame = document.createElement('canvas');
    this.measurementFrame.width = canvas.width;
    this.measurementFrame.height = canvas.height;
    this.measurementFrame.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.hidden = false;
  }

  showSizeRecommendation(text) {
    this.elements.sizeRecommendation.textContent = text;
  }

  setLoader(visible, text) {
    if (!this.elements.loader) return;
    if (text && this.elements.loaderText) {
      this.elements.loaderText.textContent = text;
    }
    if (visible) {
      this.elements.loader.classList.remove('hidden');
    } else {
      this.elements.loader.classList.add('hidden');
    }
  }

  showModal(modalKey) {
    const modal = this.elements[modalKey];
    if (modal) modal.classList.add('active');
  }

  hideModal(modalKey) {
    const modal = this.elements[modalKey];
    if (modal) modal.classList.remove('active');
  }

  showPermissionError(message) {
    const body = document.getElementById('permission-modal-text');
    if (body && message) {
      body.textContent = message;
    }
    this.showModal('permissionModal');
  }

  showTapFeedback(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ar-tap-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => {
      ripple.remove();
    }, 600);
  }
}
