/**
 * PoseDetector.js - Resilient, Fast Loading Foot Landmark AI Engine
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export class PoseDetector {
  constructor() {
    this.landmarker = null;
    this.isLoaded = false;
    this.lastVideoTime = -1;
    this.lastResult = null;
    this.listeners = new Map();
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

  async init() {
    const origin = window.location.origin;
    const baseUrl = import.meta.env.BASE_URL || '/shoe_vto/';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

    const localWasmPath = origin + cleanBase + 'wasm';
    const liteModelPath = origin + cleanBase + 'models/pose_landmarker_lite.task';
    const fullModelPath = origin + cleanBase + 'models/pose_landmarker_full.task';
    const cdnWasmPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
    const cdnModelPath = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

    try {
      this.emit('loading', { message: 'Loading AI Vision Engine...' });
      
      let vision = null;
      try {
        vision = await FilesetResolver.forVisionTasks(localWasmPath);
      } catch (e) {
        console.warn('[PoseDetector] Local WASM fallback to CDN:', e);
        vision = await FilesetResolver.forVisionTasks(cdnWasmPath);
      }

      this.emit('loading', { message: 'Initializing Foot AI Detector...' });

      // Fast loading model list (lite first for instant startup, fallback to full/CDN)
      const modelCandidates = [liteModelPath, fullModelPath, cdnModelPath];
      
      for (const modelPath of modelCandidates) {
        try {
          this.landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.22,
            minPosePresenceConfidence: 0.22,
            minTrackingConfidence: 0.18
          });
          if (this.landmarker) break;
        } catch (gpuErr) {
          try {
            this.landmarker = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: 'CPU'
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.22,
              minPosePresenceConfidence: 0.22,
              minTrackingConfidence: 0.18
            });
            if (this.landmarker) break;
          } catch (cpuErr) {}
        }
      }

      if (!this.landmarker) {
        throw new Error('Failed to initialize AI landmarker.');
      }

      this.isLoaded = true;
      this.emit('ready', { landmarker: this.landmarker });
      return this.landmarker;
    } catch (err) {
      console.error('[PoseDetector] Init error:', err);
      this.emit('error', err);
      throw err;
    }
  }

  detect(videoElement, timestamp) {
    if (!this.isLoaded || !this.landmarker || !videoElement) {
      return null;
    }

    if (videoElement.currentTime === this.lastVideoTime && this.lastResult) {
      return this.lastResult;
    }
    this.lastVideoTime = videoElement.currentTime;

    try {
      const results = this.landmarker.detectForVideo(videoElement, timestamp);
      if (results && results.landmarks && results.landmarks.length > 0) {
        this.lastResult = {
          landmarks: results.landmarks[0],
          worldLandmarks: results.worldLandmarks ? results.worldLandmarks[0] : null
        };
        return this.lastResult;
      }
    } catch (e) {
      console.warn('[PoseDetector] Detection error:', e);
    }
    this.lastResult = null;
    return null;
  }
}
