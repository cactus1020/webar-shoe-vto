import * as ort from 'onnxruntime-web';
import { inferenceGeometry } from './FrameGeometry.js';
import { decodeFootPoses } from './FootPoseDecoder.js';

export class FootNetInferenceEngine {
  constructor() {
    this.session = null;
    this.isLoaded = false;
    this.isLoading = false;
    this.inputSize = 256;
    this.listeners = new Map();
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = this.inputSize;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.floatBuffer = new Float32Array(3 * this.inputSize ** 2);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  emit(event, data) { for (const callback of this.listeners.get(event) || []) callback(data); }

  async init() {
    if (this.isLoaded || this.isLoading) return;
    this.isLoading = true;
    this.emit('loading');
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    try {
      const response = await fetch(new URL('models/footnet-release.json', base), { cache: 'no-store' });
      if (!response.ok) throw new Error('Model release metadata unavailable');
      const release = await response.json();
      if (!/^[a-zA-Z0-9_-]+\.onnx$/.test(release.file) || !release.id || !release.trainedAt) throw new Error('Invalid model release');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = new URL('wasm/', base).href;
      const modelUrl = new URL('models/' + release.file, base).href;
      try {
        this.session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      } catch {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/';
        this.session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      }
      this.release = release;
      this.isLoaded = true;
      this.emit('ready', { release, session: this.session });
    } catch (error) {
      this.emit('error', error);
    } finally { this.isLoading = false; }
  }

  canDetect() { return this.isLoaded && this.session !== null; }

  async detect(video, width, height, mirrored = false) {
    if (!this.canDetect() || !video?.videoWidth || !video.videoHeight) return null;
    const capturedAt = performance.now();
    const geometry = inferenceGeometry(video.videoWidth, video.videoHeight, width, height, this.inputSize);
    this.ctx.fillStyle = 'rgb(114,114,114)';
    this.ctx.fillRect(0, 0, this.inputSize, this.inputSize);
    this.ctx.drawImage(video, geometry.sx, geometry.sy, geometry.cropWidth, geometry.cropHeight,
      geometry.padX, geometry.padY, geometry.drawWidth, geometry.drawHeight);
    const rgba = this.ctx.getImageData(0, 0, this.inputSize, this.inputSize).data;
    const area = this.inputSize ** 2;
    for (let i = 0; i < area; i++) {
      this.floatBuffer[i] = rgba[i * 4] / 255;
      this.floatBuffer[area + i] = rgba[i * 4 + 1] / 255;
      this.floatBuffer[2 * area + i] = rgba[i * 4 + 2] / 255;
    }
    const input = new ort.Tensor('float32', this.floatBuffer, [1, 3, this.inputSize, this.inputSize]);
    const results = await this.session.run({ [this.session.inputNames[0]]: input });
    const result = decodeFootPoses(results[this.session.outputNames[0]], geometry, { mirrored });
    if (result) result.capturedAt = capturedAt;
    return result;
  }
}
