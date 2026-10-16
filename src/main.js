import { FootTrackingPipeline } from './core/FootTrackingPipeline.js';
import { FootTrackingOverlay } from './ui/FootTrackingOverlay.js';
import './styles/main.css';
/**
 * main.js
 * WebAR App with guaranteed User-Gesture Camera Permission Trigger.
 */
import { CameraManager } from './core/CameraManager.js';
import { FootNetInferenceEngine } from './core/FootNetInferenceEngine.js';
import { PoseDetector } from './core/PoseDetector.js';
import { OpticalFootDetector } from './core/OpticalFootDetector.js';
import { ThreeScene } from './core/ThreeScene.js';
import { HighDensityFootTracker } from './tracking/HighDensityFootTracker.js';
import { OcclusionManager } from './tracking/OcclusionManager.js';
import { ShoeManager } from './models/ShoeManager.js';
import { CalibrationManager } from './sizing/CalibrationManager.js';
import { SizeRecommendationEngine } from './sizing/SizeRecommendationEngine.js';
import { ProductChartStore } from './sizing/ProductChartStore.js';
import { UIManager } from './ui/UIManager.js';

class WebARShoeApp {
  constructor() {
    this.cameraManager = new CameraManager();
    this.poseDetector = new PoseDetector();
    this.opticalFootDetector = new OpticalFootDetector();
    this.footNetEngine = new FootNetInferenceEngine();
    this.trackingPipeline = new FootTrackingPipeline(this.footNetEngine, this.opticalFootDetector, this.poseDetector);
    this.isInferringFootNet = false;
    this.lastFootNetResult = null;
    this.lastSuccessfulDetection = 0;
    this.lastDetectionSource = null;
    this.threeScene = new ThreeScene();
    this.ui = new UIManager();
    this.footTracker = null;
    this.occlusionManager = null;
    this.shoeManager = null;
    this.calibrationManager = new CalibrationManager();
    this.sizeEngine = new SizeRecommendationEngine();
    this.productCharts = new ProductChartStore();
    this.selectedProductId = 'retro-white';

    this.isRunning = false;
    this.lastInferenceStarted = -Infinity;
    this.cameraGeneration = 0;
    this.manualPlacement = false;
    this.manualAlignment = null;
  }

  init() {
    this.ui.init();

    const videoElement = document.getElementById('camera-video');
    const canvasElement = document.getElementById('webgl-canvas');
    const splash = document.getElementById('start-splash');
    const startBtn = document.getElementById('btn-start-ar');

    this.threeScene.init(canvasElement);
    this.footTracker = new HighDensityFootTracker(this.threeScene);
    this.occlusionManager = new OcclusionManager(this.threeScene);
    this.shoeManager = new ShoeManager(this.threeScene);
    this.footTracker.setRenderBounds(this.shoeManager.renderBounds);

    this.bindUIEvents();

    // 1. Warm up MediaPipe PoseLandmarker (GPU Tier 1)
    this.poseDetector.on('ready', () => {
      console.log('[WebARShoeApp] MediaPipe Pose GPU engine ready');
      this.ui.updateAIEngineStatus('AI: MediaPipe GPU ready', 'active');
    });
    this.poseDetector.on('loading', (d) => {
      this.ui.updateAIEngineStatus(d.message || 'AI: Loading Vision Engine...', 'loading');
    });
    this.poseDetector.on('error', (err) => {
      console.warn('[WebARShoeApp] MediaPipe Pose fallback:', err);
    });
    this.poseDetector.init().catch(err => {
      console.warn('[WebARShoeApp] PoseDetector init notice:', err);
    });

    // 2. Secondary AI: FootNet Deep Neural Network for top-down foot detection
    this.footNetEngine.on('ready', (data) => {
      console.log('[WebARShoeApp] FootNet neural engine ready:', data);
      this.ui.updateModelRelease(data.release);
    });
    this.footNetEngine.on('error', (err) => {
      console.warn('[WebARShoeApp] FootNet AI error:', err);
    });

    this.footNetEngine.init().catch((err) => {
      console.warn('[WebARShoeApp] FootNet AI initialization notice:', err);
    });

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 250);
    });

    const appContainer = document.getElementById('app-container');
    this.trackingOverlay = new FootTrackingOverlay(appContainer, this.opticalFootDetector, () => {this.stopManualAlignment();this.trackingPipeline.reset();});
    this.trackingOverlay.bar.style.bottom='auto';
    this.trackingOverlay.bar.style.top='175px';

    if (appContainer) {
      appContainer.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.interactive') || e.target.closest('.modal-card') || e.target.closest('#start-splash')) {
          return;
        }

        if (this.manualAlignment) {
          const rect = appContainer.getBoundingClientRect();
          this.addAlignmentPoint(e.clientX - rect.left, e.clientY - rect.top);
          return;
        }
        if (this.calibrationManager.isCollecting()) {
          return;
        }

        if (this.cameraManager.isReady && !this.manualPlacement) {
          const rect=appContainer.getBoundingClientRect();
          this.trackingOverlay.tap(videoElement,e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height,this.cameraManager.isFacingUser());
        }
      });
    }

    // Camera dimension changes
    this.cameraManager.on('dimensionsChange', () => this.handleResize());
    this.cameraManager.on('ready', () => {
      this.cameraGeneration++;
      this.lastFootNetResult = null;
      this.lastSuccessfulDetection = 0;
      this.stopManualAlignment();
      this.handleResize();
      if (this.footTracker) {
        this.footTracker.clearManualAnchors();
        this.trackingPipeline.reset();
      }
    });

    // Handle Start AR Button (Single-shot, safe user gesture for iOS Safari & Chrome)
    let isStartingAR = false;
    const onStartAR = async (e) => {
      if (e) {
        e.stopPropagation();
      }
      if (isStartingAR) return;
      isStartingAR = true;

      if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<span>Requesting Camera...</span>';
      }

      try {
        console.log('[WebARShoeApp] Starting camera via user interaction...');
        await this.cameraManager.init(videoElement);
        this.handleResize();

        if (splash) {
          splash.classList.add('hidden');
        }

        this.isRunning = true;
        requestAnimationFrame((t) => this.loop(t));


      } catch (err) {
        console.error('[WebARShoeApp] Camera permission error:', err);
        isStartingAR = false;
        if (startBtn) {
          startBtn.disabled = false;
          startBtn.innerHTML = '<span>Try Again (Allow Camera)</span>';
        }
        this.ui.showPermissionError('Please allow Camera access in your browser settings: ' + (err.message || err));
      }
    };

    if (startBtn) {
      startBtn.addEventListener('click', onStartAR);
    }
  }

  bindUIEvents() {
    this.ui.on('loadShowcase', async () => {
      this.ui.updateShoeInfo('Loading Studio Sneaker…', 'Textured 3D model', '');
      try {
        const info = await this.shoeManager.loadGLTF(import.meta.env.BASE_URL + 'models/showcase-shoe.glb');
        if (!info) return;
        this.footTracker.setRenderBounds(this.shoeManager.renderBounds);
        this.selectedProductId = 'studio-sneaker';
        this.updateSizeRecommendation();
        this.ui.updateShoeInfo('Studio Sneaker', 'Shopify · CC BY 4.0 · demo model', 'Preview');
      } catch (error) { this.ui.updateShoeInfo('Model unavailable', error.message, 'Try again'); }
    });
    this.ui.on('selectStyle', (styleId) => {
      this.selectedProductId = styleId;
      this.updateSizeRecommendation();
      const style = this.shoeManager.loadStyle(styleId);
      this.footTracker.setRenderBounds(this.shoeManager.renderBounds);
      if (style) {
        this.ui.updateShoeInfo(style.name, style.tagline, style.price);
      }
    });

    this.ui.on('loadCustomGLB', async (file) => {
      try {
        const info = await this.shoeManager.loadGLTF(file);
        if (!info) return;
        this.footTracker.setRenderBounds(this.shoeManager.renderBounds);
        this.selectedProductId = 'custom:' + file.name;
        this.updateSizeRecommendation();
        this.ui.updateShoeInfo(info.name, 'Custom 3D Import', info.price);
      } catch (err) {
        alert('Failed to load custom GLB model: ' + err.message);
      }
    });

    this.ui.on('flipCamera', async () => {
      try {
        await this.cameraManager.flipCamera();
        this.handleResize();
      } catch (err) {
        this.ui.showPermissionError('Could not flip camera: ' + err.message);
      }
    });

    this.ui.on('retryCamera', async () => {
      try {
        const videoElement = document.getElementById('camera-video');
        await this.cameraManager.startCamera();
        this.handleResize();
      } catch (err) {
        this.ui.showPermissionError(err.message);
      }
    });

    this.ui.on('toggleOccluder', () => {
      this.occlusionManager.toggleDebug();
    });

    this.ui.on('captureSnapshot', () => {
      this.captureSnapshot();
    });
    this.ui.on('alignFeet', () => {
      if (this.manualPlacement) {
        this.stopManualAlignment();
        return;
      }
      if (!this.cameraManager.isReady) return;
      this.footTracker.clearManualAnchors();
      this.manualPlacement = true;
      this.manualAlignment = [];
      this.cameraManager.videoElement.pause();
      this.ui.setAlignmentHint('বাম দিকে দেখা পায়ের গোড়ালির পেছনে ট্যাপ করুন।', true);
    });

    this.ui.on('startSizeScan', () => {
      if (this.manualAlignment) this.stopManualAlignment();
      this.ui.showCalibration(this.calibrationManager.getState());
      this.updateSizeRecommendation();
    });

    this.ui.on('cancelSizeScan', () => {
      // Closing the panel preserves the captured frame and measurement.
    });
    this.ui.on('restartSizeScan', () => {
      this.calibrationManager.reset();
      this.ui.measurementFrame = null;
      this.ui.elements.measurementCanvas.hidden = true;
      this.ui.showCalibration(this.calibrationManager.getState());
      this.updateSizeRecommendation();
    });
    this.ui.on('captureMeasurementFrame', () => {
      try {
        this.ui.setMeasurementFrame(this.cameraManager.videoElement || {});
        this.ui.updateCalibration(this.calibrationManager.start());
        this.updateSizeRecommendation();
      } catch (error) { this.ui.showSizeRecommendation(error.message); }
    });
    this.ui.on('loadMeasurementPhoto', async (file) => {
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        this.ui.setMeasurementFrame(image);
        this.ui.updateCalibration(this.calibrationManager.start());
        this.updateSizeRecommendation();
      } catch { this.ui.showSizeRecommendation('ছবিটি পড়া যায়নি। JPG বা PNG দিয়ে আবার চেষ্টা করুন।'); }
      finally { URL.revokeObjectURL(url); }
    });
    this.ui.on('measurementPoint', ({ x, y }) => {
      this.ui.updateCalibration(this.calibrationManager.addPoint(x, y));
      this.updateSizeRecommendation();
    });
    this.ui.on('undoMeasurementPoint', () => {
      this.ui.updateCalibration(this.calibrationManager.undo());
      this.updateSizeRecommendation();
    });
    this.ui.on('importSizeChart', async (file) => {
      const productId = this.selectedProductId;
      try {
        if (file.size > 100000) throw new Error('Chart file 100 KB-এর নিচে রাখুন।');
        this.productCharts.importChart(JSON.parse(await file.text()), productId);
        this.updateSizeRecommendation();
      } catch (error) { this.ui.showSizeRecommendation(error.message); }
    });
  }

  stopManualAlignment() {
    this.lastFootNetResult = null;
    this.cameraGeneration++;
    this.manualPlacement = false;
    this.manualAlignment = null;
    this.footTracker?.clearManualAnchors();
    this.ui.setAlignmentHint(null, false);
    const video = this.cameraManager.videoElement;
    if (video?.paused && this.cameraManager.isReady) video.play().catch(() => {});
  }

  addAlignmentPoint(x, y) {
    this.manualAlignment.push({ x, y });
    const count = this.manualAlignment.length;
    if (count === 2 || count === 4) {
      const side = count === 2 ? 'left' : 'right';
      if (!this.footTracker.setScreenAnchors(side, this.manualAlignment[count - 2], this.manualAlignment[count - 1], this.viewWidth, this.viewHeight)) {
        this.manualAlignment.pop();
        this.ui.setAlignmentHint('আঙুলের ডগায় আবার ট্যাপ করুন—গোড়ালি থেকে যথেষ্ট দূরে।', true);
        return;
      }
    }
    const hints = ['বাম দিকে দেখা পায়ের সবচেয়ে লম্বা আঙুলে ট্যাপ করুন।',
      'ডান দিকে দেখা পায়ের গোড়ালির পেছনে ট্যাপ করুন।',
      'ডান দিকে দেখা পায়ের সবচেয়ে লম্বা আঙুলে ট্যাপ করুন।'];
    if (count < 4) this.ui.setAlignmentHint(hints[count - 1], true);
    else {
      this.manualAlignment = null;
      this.cameraManager.videoElement.play().catch(() => {});
      this.ui.setAlignmentHint('Manual placement • পা/ফোন নড়লে Auto চাপুন, আবার Align করুন।', true);
    }
  }

  updateSizeRecommendation() {
    const chart = this.productCharts.get(this.selectedProductId);
    const result = this.sizeEngine.recommend(this.calibrationManager.getDisplayData(), chart?.sizes);
    const product = `Product: ${this.selectedProductId}। `;
    if (result.status === 'recommended') {
      this.ui.showSizeRecommendation(`${product}সম্ভাব্য size: ${result.size}। সামনে ফাঁকা ${result.lengthClearanceMm} mm, প্রস্থে ${result.widthClearanceMm} mm। Chart source: ${chart.source}। কেনার আগে fit পরীক্ষা করুন।`);
      return;
    }
    const messages = {
      calibration_required: 'ছবি নিয়ে ছয়টি point দিন।',
      measurement_review_required: 'আরও পরিষ্কার ও কাছ থেকে ছবি নিয়ে আবার মাপুন।',
      verified_size_chart_required: 'এই product-এর যাচাই করা ভেতরের দৈর্ঘ্য/প্রস্থের chart আপলোড করুন।',
      no_matching_verified_size: 'এই chart-এ মাপ অনুযায়ী উপযুক্ত size পাওয়া যায়নি।'
    };
    this.ui.showSizeRecommendation(product + messages[result.reason]);
  }

  handleResize() {
    const video = this.cameraManager.videoElement;
    const vWidth = video && video.videoWidth ? video.videoWidth : 1280;
    const vHeight = video && video.videoHeight ? video.videoHeight : 720;
    const rect = document.getElementById('app-container').getBoundingClientRect();
    const cWidth = rect.width;
    const cHeight = rect.height;
    if (this.manualPlacement && (this.viewWidth !== cWidth || this.viewHeight !== cHeight)) this.stopManualAlignment();
    if (this.viewWidth !== cWidth || this.viewHeight !== cHeight) this.trackingPipeline.reset();
    this.viewWidth = cWidth;
    this.viewHeight = cHeight;

    this.threeScene.updateSize(cWidth, cHeight, vWidth, vHeight);
  }

  loop(timestamp) {
    if (!this.isRunning) return;

    const video = this.cameraManager.videoElement;
    const cWidth = this.viewWidth;
    const cHeight = this.viewHeight;
    const vWidth = video && video.videoWidth ? video.videoWidth : 1280;
    const vHeight = video && video.videoHeight ? video.videoHeight : 720;

    if (video && video.readyState >= 2) {
      this.threeScene.updateLighting(video, timestamp);

      const result = this.manualPlacement ? null : this.trackingPipeline.detect(video,cWidth,cHeight,this.cameraManager.isFacingUser(),timestamp);
      this.trackingOverlay.draw(result,video,cWidth,cHeight,this.cameraManager.isFacingUser());
      const feet = this.footTracker.update(result?.landmarks || null,null,
        cWidth,cHeight,vWidth,vHeight,this.cameraManager.isFacingUser());
      const tracked = feet.left.isTracked || feet.right.isTracked;
      this.ui.updateAIEngineStatus(this.manualPlacement ? 'Manual placement' :
        result && tracked ? result.source : this.trackingOverlay.enabled ? 'Tap foot centre • use a contrasting floor' : 'Feet not found • try Tap to track or Align',
        result && tracked ? 'active' : 'scanning');
      // Phantom Z-Buffer depth occlusion pass (renderOrder 0 -> 1)
      this.occlusionManager.update(feet.left, feet.right);
      this.shoeManager.update(feet.left, feet.right);
      this.ui.updateHUD(feet.left, feet.right, this.calibrationManager.getDisplayData());
    }

    this.threeScene.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  captureSnapshot() {
    this.ui.triggerShutterFlash();

    const video = this.cameraManager.videoElement;
    const canvas = this.threeScene.canvas;
    if (!video || !canvas) return;

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const offscreen = document.createElement('canvas');
    offscreen.width = cw * dpr;
    offscreen.height = ch * dpr;

    const ctx = offscreen.getContext('2d');
    ctx.scale(dpr, dpr);

    const vw = video.videoWidth || cw;
    const vh = video.videoHeight || ch;
    const scale = Math.max(cw / vw, ch / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (renderedW - cw) / 2;
    const offsetY = (renderedH - ch) / 2;

    if (this.cameraManager.isFacingUser()) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -renderedW + offsetX, -offsetY, renderedW, renderedH);
      ctx.restore();
    } else {
      ctx.drawImage(video, -offsetX, -offsetY, renderedW, renderedH);
    }

    ctx.drawImage(canvas, 0, 0, cw, ch);

    ctx.fillStyle = 'rgba(0, 242, 254, 0.9)';
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.fillText('WebAR VTO', 24, ch - 36);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillText('Client-Side Virtual Try-On', 24, ch - 16);

    const dataUrl = offscreen.toDataURL('image/png');
    this.ui.showSnapshotPreview(dataUrl);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new WebARShoeApp();
  app.init();
});
