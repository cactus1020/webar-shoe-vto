
/**
 * ThreeScene.js
 * Configures the Three.js 3D WebGL scene, perspective camera,
 * realistic studio PBR lighting, and video viewport synchronization.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class ThreeScene {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.lights = {};
    this.groundPlane = null;
    
    // Viewport dimensions
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspectRatio = this.width / this.height;
    this.fov = 50; // Standard 50 degree vertical FOV matching mobile cameras
  }

  /**
   * Initializes the Three.js WebGL canvas and scene graph.
   * @param {HTMLCanvasElement} canvasElement 
   */
  init(canvasElement) {
    if (!canvasElement) {
      throw new Error('[ThreeScene] HTMLCanvasElement is required.');
    }
    this.canvas = canvasElement;

    // 1. Create Scene
    this.scene = new THREE.Scene();

    // 2. Create Camera
    this.camera = new THREE.PerspectiveCamera(
      this.fov,
      this.aspectRatio,
      0.01,
      100
    );
    this.camera.position.set(0, 0, 0); // Camera at origin looking down -Z axis

    // 3. Create WebGL Renderer with Alpha transparency for AR overlay
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });

    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Setup Lighting & Ground Contact Shadow Plane
    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = generator.fromScene(environment, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    environment.dispose();
    generator.dispose();
    this.probe = document.createElement('canvas');
    this.probe.width = this.probe.height = 16;
    this.probeContext = this.probe.getContext('2d', { willReadFrequently: true });
    this.lastProbe = -Infinity;
    this.setupLighting();
    this.setupGroundShadow();

    return this;
  }

  /**
   * Sets up realistic studio lighting with key, fill, and environmental lights.
   */
  setupLighting() {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);
    this.lights.ambient = ambientLight;

    // Hemisphere light simulating sky/ground ambient color temperature
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.2);
    hemiLight.position.set(0, 10, 0);
    this.scene.add(hemiLight);
    this.lights.hemi = hemiLight;

    // Main Key Light (casting crisp shadows downwards onto feet)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(0.6, 2.5, 0.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 6.0;
    keyLight.shadow.camera.left = -1.2;
    keyLight.shadow.camera.right = 1.2;
    keyLight.shadow.camera.top = 1.2;
    keyLight.shadow.camera.bottom = -1.2;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);
    this.lights.key = keyLight;

    // Fill Light (soft warm balance)
    const fillLight = new THREE.DirectionalLight(0xddeeff, 1.0);
    fillLight.position.set(-2, 2, 1);
    this.scene.add(fillLight);
    this.lights.fill = fillLight;

    // Rim / Backlight (creates stylish edge separation)
    const rimLight = new THREE.DirectionalLight(0x00f2fe, 0.6);
    rimLight.position.set(0, -1, -3);
    this.scene.add(rimLight);
    this.lights.rim = rimLight;
  }

  /**
   * Setup dynamic shadow receiver plane for realistic ground contact shadows.
   */
  setupGroundShadow() {
    const shadowPlaneGeo = new THREE.PlaneGeometry(3.0, 3.0);
    const shadowPlaneMat = new THREE.ShadowMaterial({
      opacity: 0.28,
      transparent: true,
      depthWrite: false
    });
    this.groundPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.set(0, -0.60, -0.80);
    this.groundPlane.receiveShadow = true;
    this.groundPlane.renderOrder = -1;
    this.groundPlane.name = 'Ground_Contact_Shadow_Plane';
    this.scene.add(this.groundPlane);
  }

  /**
   * Dynamically update ground contact shadow plane position under detected feet.
   * @param {THREE.Vector3} groundPos 
   * @param {number} [opacity]
   */
  updateGroundPlane(groundPos, opacity = 0.42) {
    if (!this.groundPlane || !groundPos) return;
    this.groundPlane.position.set(groundPos.x, groundPos.y - 0.008, groundPos.z);
    if (this.groundPlane.material) {
      this.groundPlane.material.opacity = opacity;
    }
  }

  /**
   * Synchronizes Three.js canvas & camera projection with video display size.
   * @param {number} containerWidth 
   * @param {number} containerHeight 
   * @param {number} videoWidth 
   * @param {number} videoHeight 
   */
  updateSize(containerWidth, containerHeight, videoWidth, videoHeight) {
    this.width = containerWidth || window.innerWidth;
    this.height = containerHeight || window.innerHeight;
    this.aspectRatio = this.width / this.height;

    if (this.camera) {
      this.camera.aspect = this.aspectRatio;
      this.camera.updateProjectionMatrix();
    }

    if (this.renderer) {
      this.renderer.setSize(this.width, this.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  /**
   * Adds an object to the 3D scene.
   * @param {THREE.Object3D} object 
   */
  add(object) {
    if (this.scene) {
      this.scene.add(object);
    }
  }

  /**
   * Removes an object from the 3D scene.
   * @param {THREE.Object3D} object 
   */
  remove(object) {
    if (this.scene) {
      this.scene.remove(object);
    }
  }

  /**
   * Renders one frame of the 3D scene.
   */
  updateLighting(video, timestamp) {
    if (!video || video.readyState < 2 || timestamp - this.lastProbe < 500) return;
    this.lastProbe = timestamp;
    this.probeContext.drawImage(video, 0, 0, 16, 16);
    const pixels = this.probeContext.getImageData(0, 0, 16, 16).data;
    let luminance = 0;
    for (let i = 0; i < pixels.length; i += 4) luminance += (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
    const target = THREE.MathUtils.clamp(0.7 + luminance / 256, 0.75, 1.4);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, target, 0.2);
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
