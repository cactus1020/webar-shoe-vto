import { FootTrackingPipeline } from './core/FootTrackingPipeline.js';
import { FootTrackingOverlay } from './ui/FootTrackingOverlay.js';
import { PoseDetector } from './core/PoseDetector.js';
import { FootNetInferenceEngine } from './core/FootNetInferenceEngine.js';
import { OpticalFootDetector } from './core/OpticalFootDetector.js';
import { fitScreenFoot } from './tracking/ScreenFootFit.js';
import { videoPointToScreen } from './core/FrameGeometry.js';

    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
    import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
    import { FaceLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

    // ============================================================================
    // 1. MULTI-CDN SOURCES FOR OFFICIAL KHRONOS SCANNED 3D SHOE (.GLB)
    // ============================================================================
    const SHOE_GLB_URLS = [import.meta.env.BASE_URL + 'models/showcase-shoe.glb'];

    // ============================================================================
    // 2. 1-EURO ADAPTIVE LOW-PASS FILTER (SHARED FOR BOTH SHOE & EYEGLASS)
    // ============================================================================
    class LowPassFilter {
      constructor() { this.y = null; this.s = null; }
      filter(v, alpha) {
        this.s = (this.y === null) ? v : alpha * v + (1.0 - alpha) * this.s;
        this.y = v;
        return this.s;
      }
    }

    class OneEuroFilter {
      constructor(freq = 60, minCutoff = 1.2, beta = 0.08, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.x = new LowPassFilter();
        this.dx = new LowPassFilter();
        this.lastTime = null;
      }
      alpha(cutoff) {
        const te = 1.0 / this.freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
      }
      filter(v, tMs) {
        if (this.lastTime !== null && tMs > this.lastTime) {
          this.freq = Math.min(120, Math.max(15, 1000.0 / (tMs - this.lastTime)));
        }
        this.lastTime = tMs;
        const dv = (this.x.y !== null) ? (v - this.x.y) * this.freq : 0.0;
        const edv = this.dx.filter(dv, this.alpha(this.dCutoff));
        const cutoff = this.minCutoff + this.beta * Math.abs(edv);
        return this.x.filter(v, this.alpha(cutoff));
      }
    }

    class PoseFilter3D {
      constructor(minCutoff = 1.2, beta = 0.08) {
        this.fx = new OneEuroFilter(60, minCutoff, beta);
        this.fy = new OneEuroFilter(60, minCutoff, beta);
        this.fz = new OneEuroFilter(60, minCutoff, beta);
        this.lastQuat = null;
      }
      setBeta(beta) {
        this.fx.beta = beta; this.fy.beta = beta; this.fz.beta = beta;
      }
      filterPos(vec, tMs) {
        return new THREE.Vector3(
          this.fx.filter(vec.x, tMs),
          this.fy.filter(vec.y, tMs),
          this.fz.filter(vec.z, tMs)
        );
      }
      filterQuat(q, slerpFactor = 0.38) {
        if (!this.lastQuat) {
          this.lastQuat = q.clone();
          return q.clone();
        }
        if (this.lastQuat.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        this.lastQuat.slerp(q, slerpFactor);
        return this.lastQuat.clone();
      }
    }

    // ============================================================================
    // 3. THREE.JS SCENE, ENVIRONMENT & HIGH-RES SOFT SHADOW SETUP
    // ============================================================================
    const container = document.getElementById('viewport-container');
    const canvas = document.getElementById('vto-canvas');
    const video = document.getElementById('ar-video');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatus = document.getElementById('loading-status');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.015, 50);
    camera.position.set(0.46, 0.24, 0.48);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, -0.02, 0.02);

    const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.2);
    keyLight.position.set(0.45, 1.2, 0.85);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.05;
    keyLight.shadow.camera.far = 3.5;
    const d = 0.38;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 3.8;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-0.7, 0.5, -0.6);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const studioGrid = new THREE.GridHelper(1.6, 16, 0x1e293b, 0x0f172a);
    studioGrid.position.y = -0.095;
    scene.add(studioGrid);

    // Master Root Groups for the 2 Engines
    const shoeModeRoot = new THREE.Group();
    const glassModeRoot = new THREE.Group();
    glassModeRoot.visible = false;
    scene.add(shoeModeRoot);
    scene.add(glassModeRoot);

    // Shared Phantom Occluder Material (writes only to Z-Buffer, RenderOrder = 0)
    const phantomOccluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthFunc: THREE.LessEqualDepth
    });

    // ============================================================================
    // 4. ENGINE A: WANNA-GRADE 3D SHOE VTO MODULE
    // ============================================================================
    const shadowMaterial = new THREE.ShadowMaterial({
      opacity: 0.55,
      transparent: true,
      depthWrite: false
    });
    const groundShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), shadowMaterial);
    groundShadowPlane.rotation.x = -Math.PI / 2;
    groundShadowPlane.position.y = -0.094;
    groundShadowPlane.receiveShadow = true;
    shoeModeRoot.add(groundShadowPlane);

    const rightFootAnchor = new THREE.Group();
    const leftFootAnchor = new THREE.Group();
    shoeModeRoot.add(rightFootAnchor);
    shoeModeRoot.add(leftFootAnchor);

    let loadedShoeGltf = null;
    let shoeRenderBounds = { minZ: -0.12, maxZ: 0.16 };
    let rightShoeContainer = new THREE.Group();
    let leftShoeContainer = new THREE.Group();

    const skinProxyMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.65, metalness: 0.05 });
    const denimProxyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
    const cavityDarkMat = new THREE.MeshBasicMaterial({ color: 0x05070b });

    function createAnatomicalFootRig(isLeft = false) {
      const group = new THREE.Group();

      const legGeo = new THREE.CylinderGeometry(0.041, 0.033, 0.24, 32);
      legGeo.translate(0, 0.11, -0.032);
      const legMesh = new THREE.Mesh(legGeo, phantomOccluderMat);
      legMesh.renderOrder = 0;
      group.add(legMesh);

      const cavityGeo = new THREE.CylinderGeometry(0.035, 0.032, 0.025, 24);
      cavityGeo.translate(0, 0.002, -0.032);
      const cavityMesh = new THREE.Mesh(cavityGeo, cavityDarkMat);
      cavityMesh.renderOrder = 1;
      group.add(cavityMesh);

      const cuffGeo = new THREE.CylinderGeometry(0.058, 0.068, 0.16, 32, 8, true);
      cuffGeo.translate(0, 0.09, -0.018);
      const cuffMesh = new THREE.Mesh(cuffGeo, phantomOccluderMat);
      cuffMesh.rotation.x = 0.14;
      cuffMesh.renderOrder = 0;
      group.add(cuffMesh);

      const kpGroup = new THREE.Group();
      const kpPositions = [
        [0, 0.01, -0.032, 0x38bdf8],
        [-0.036, 0.0, -0.032, 0x22c55e],
        [0.036, 0.0, -0.032, 0x22c55e],
        [0, -0.04, -0.095, 0xf59e0b],
        [0, -0.088, -0.08, 0xf59e0b],
        [0, -0.015, 0.025, 0xa855f7],
        [-0.042, -0.075, 0.055, 0xec4899],
        [0.042, -0.075, 0.055, 0xec4899],
        [0, -0.078, 0.145, 0xef4444]
      ];
      const sphereGeo = new THREE.SphereGeometry(0.0055, 14, 14);
      kpPositions.forEach(([x, y, z, hex]) => {
        const dot = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: hex, depthTest: false }));
        dot.position.set(isLeft ? -x : x, y, z);
        dot.renderOrder = 10;
        kpGroup.add(dot);
      });

      const linePts = [
        new THREE.Vector3(0, 0.01, -0.032),
        new THREE.Vector3(0, -0.088, -0.08),
        new THREE.Vector3(0, -0.078, 0.145),
        new THREE.Vector3(0, -0.015, 0.025),
        new THREE.Vector3(0, 0.01, -0.032)
      ];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: false, transparent: true, opacity: 0.75 })
      );
      line.renderOrder = 9;
      kpGroup.add(line);

      group.add(kpGroup);
      return { group, legMesh, cuffMesh, kpGroup };
    }

    const rightRig = createAnatomicalFootRig(false);
    const leftRig = createAnatomicalFootRig(true);
    rightFootAnchor.add(rightRig.group);
    leftFootAnchor.add(leftRig.group);

    function deformShoeVerticesForToeFlex(shoeRoot, toeBendRad) {
      if (shoeRoot.userData.lastToeBend === toeBendRad) return;
      shoeRoot.userData.lastToeBend = toeBendRad;
      shoeRoot.traverse((child) => {
        if (child.isMesh && child.userData.basePositions) {
          const posAttr = child.geometry.attributes.position;
          const base = child.userData.basePositions;
          const normCoords = child.userData.normMetricCoords;
          const hingeZ = 0.025;
          const soleY = -0.088;
          const local = new THREE.Vector3();

          for (let i = 0; i < posAttr.count; i++) {
            const bx = base[i * 3];
            const by = base[i * 3 + 1];
            const bz = base[i * 3 + 2];
            const mz = normCoords[i * 3 + 2];
            const my = normCoords[i * 3 + 1];

            if (mz > hingeZ && toeBendRad > 0.001) {
              const t = Math.min(1.0, (mz - hingeZ) / 0.11);
              const smoothWeight = t * t * (3.0 - 2.0 * t);
              const angle = toeBendRad * smoothWeight;
              const dy = my - soleY;
              const dz = mz - hingeZ;
              const scaleInv = child.userData.metricToLocalScale || 1.0;
              const newY = soleY + dy * Math.cos(angle) + dz * Math.sin(angle);
              const newZ = hingeZ - dy * Math.sin(angle) + dz * Math.cos(angle);
              local.set(normCoords[i * 3], newY, newZ).applyMatrix4(child.userData.metricToLocal);
              posAttr.setXYZ(i, local.x, local.y, local.z);
            } else {
              posAttr.setXYZ(i, bx, by, bz);
            }
          }
          posAttr.needsUpdate = true;
          child.geometry.computeVertexNormals();
        }
      });
    }

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    async function loadShoeFromUrls(urls) {
      for (const url of urls) {
        try {
          const gltf = await gltfLoader.loadAsync(url);
          return gltf;
        } catch (err) {
          console.warn('Fallback CDN tried:', url);
        }
      }
      throw new Error('Shoe CDN failed');
    }

    function setupNormalizedShoePair(gltf) {
      loadedShoeGltf = gltf;
      rightFootAnchor.remove(rightShoeContainer);
      leftFootAnchor.remove(leftShoeContainer);

      rightShoeContainer = new THREE.Group();
      leftShoeContainer = new THREE.Group();

      const rawShoe = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(rawShoe);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const TARGET_SHOE_LENGTH = 0.285;
      const maxDim = Math.max(size.x, size.z);
      const normScale = TARGET_SHOE_LENGTH / maxDim;

      rawShoe.position.sub(center);
      const orientedWrapper = new THREE.Group();
      orientedWrapper.add(rawShoe);

      if (size.x > size.z) {
        orientedWrapper.rotation.y = -Math.PI / 2;
      }
      orientedWrapper.scale.setScalar(normScale);
      orientedWrapper.position.set(0, -0.018, 0.022);
      orientedWrapper.updateMatrixWorld(true);

      rawShoe.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.renderOrder = 2;
          child.geometry = child.geometry.clone();

          const pos = child.geometry.attributes.position;
          const basePositions = new Float32Array(pos.count * 3);
          const normMetricCoords = new Float32Array(pos.count * 3);
          const v = new THREE.Vector3();

          for (let i = 0; i < pos.count; i++) {
            basePositions[i * 3] = pos.getX(i);
            basePositions[i * 3 + 1] = pos.getY(i);
            basePositions[i * 3 + 2] = pos.getZ(i);
            v.fromBufferAttribute(pos, i);
            v.applyMatrix4(child.matrixWorld);
            normMetricCoords[i * 3] = v.x;
            normMetricCoords[i * 3 + 1] = v.y;
            normMetricCoords[i * 3 + 2] = v.z;
          }

          child.userData.localToMetric = child.matrixWorld.clone();
          child.userData.metricToLocal = child.matrixWorld.clone().invert();
          child.userData.basePositions = basePositions;
          child.userData.normMetricCoords = normMetricCoords;
          child.userData.metricToLocalScale = 1.0 / normScale;
        }
      });

      rightShoeContainer.add(orientedWrapper);

      const leftMirrored = rightShoeContainer.clone(true);
      leftMirrored.scale.x = -1;
      leftMirrored.traverse((child) => {
        if (child.isMesh) {
          child.geometry = child.geometry.clone();
          const srcMesh = [];
          rightShoeContainer.traverse((m) => { if (m.isMesh && m.name === child.name) srcMesh.push(m); });
          if (srcMesh[0]) {
            child.userData.basePositions = new Float32Array(srcMesh[0].userData.basePositions);
            child.userData.normMetricCoords = new Float32Array(srcMesh[0].userData.normMetricCoords);
            child.userData.metricToLocalScale = srcMesh[0].userData.metricToLocalScale;
            child.userData.metricToLocal = srcMesh[0].userData.metricToLocal.clone();
          }
        }
      });
      leftShoeContainer.add(leftMirrored);

      rightFootAnchor.add(rightShoeContainer);
      leftFootAnchor.add(leftShoeContainer);
      // Bounds are in the shoe anchor frame, independent of studio camera/pose.
      rightShoeContainer.updateWorldMatrix(true, true);
      const inverse = rightFootAnchor.matrixWorld.clone().invert();
      const renderBox = new THREE.Box3();
      rightShoeContainer.traverse(child => {
        if (!child.isMesh) return;
        child.geometry.computeBoundingBox();
        renderBox.union(child.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld)));
      });
      shoeRenderBounds = { minZ: renderBox.min.z, maxZ: renderBox.max.z };
    }

    async function selectShoeColorwayVariant(variantName) {
      if (!loadedShoeGltf || !loadedShoeGltf.parser) return;
      const variantsDef = loadedShoeGltf.parser.json.extensions?.KHR_materials_variants?.variants;
      if (!variantsDef) return;
      const variantIndex = variantsDef.findIndex((v) => v.name.toLowerCase() === variantName.toLowerCase());
      if (variantIndex === -1) return;

      const applyVariantToTree = async (rootGroup) => {
        const tasks = [];
        rootGroup.traverse((object) => {
          if (!object.isMesh) return;
          const ext = object.userData.gltfExtensions?.KHR_materials_variants;
          if (!ext || !ext.mappings) return;
          const mapping = ext.mappings.find((m) => m.variants.includes(variantIndex));
          if (mapping) {
            tasks.push(
              loadedShoeGltf.parser.getDependency('material', mapping.material).then((mat) => {
                object.material = mat;
                object.material.needsUpdate = true;
              })
            );
          }
        });
        await Promise.all(tasks);
      };

      await Promise.all([applyVariantToTree(rightShoeContainer), applyVariantToTree(leftShoeContainer)]);
    }

    // ============================================================================
    // 5. ENGINE B: META GLASSES BY LISA 3D EYEGLASS VTO MODULE
    // ============================================================================
    const headAnchor = new THREE.Group();
    glassModeRoot.add(headAnchor);

    // Custom GLSL Dual-Coat Fresnel + Top-to-Bottom Gradient Lens Material
    const lensUniforms = {
      uTopColor: { value: new THREE.Color(0xff5ca8) },    // LISA Signature Pink/Plum Top Tint
      uBottomColor: { value: new THREE.Color(0xffd6e7) }  // Soft Rose Bottom Gradient
    };

    const lisaLensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.84,
      opacity: 1.0,
      transparent: true,
      roughness: 0.03,
      metalness: 0.04,
      ior: 1.523,               // Real optical crown glass Index of Refraction
      thickness: 0.0035,
      clearcoat: 1.0,           // Anti-reflective (AR) outer optical coat
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.4,
      side: THREE.DoubleSide
    });

    lisaLensMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTopColor = lensUniforms.uTopColor;
      shader.uniforms.uBottomColor = lensUniforms.uBottomColor;

      shader.vertexShader = `
        varying vec2 vLensUv;
        ${shader.vertexShader}
      `.replace(
        `#include <uv_vertex>`,
        `#include <uv_vertex>
 vLensUv = uv;`
      );

      shader.fragmentShader = `
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        varying vec2 vLensUv;
        ${shader.fragmentShader}
      `.replace(
        `#include <color_fragment>`,
        `#include <color_fragment>
         vec3 gradTint = mix(uBottomColor, uTopColor, smoothstep(0.12, 0.88, vLensUv.y));
         diffuseColor.rgb *= gradTint;`
      );
    };

    // Frame & Star Accent Materials
    const frameAcetateMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x16161d,
      roughness: 0.12,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.8
    });

    const chromeStarMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.96,
      roughness: 0.08,
      envMapIntensity: 2.5
    });

    // Face Mannequin + Phantom Occluder + Nose/Cheek Shadow Catcher
    const faceShadowMaterial = new THREE.ShadowMaterial({
      opacity: 0.32,
      transparent: true,
      depthWrite: false
    });

    const faceMannequinMat = new THREE.MeshStandardMaterial({
      color: 0xdba982,
      roughness: 0.58,
      metalness: 0.04
    });

    function buildMetaLisaEyeglassRig() {
      const rigGroup = new THREE.Group();

      // 1. Anatomical Head & Nose Bridge Proxy (Origin (0,0,0) = Nose Bridge Landmark 168)
      const headGroup = new THREE.Group();
      const craniumGeo = new THREE.SphereGeometry(0.078, 36, 36);
      craniumGeo.scale(0.88, 1.12, 0.98);
      craniumGeo.translate(0, -0.015, -0.068);

      const noseGeo = new THREE.ConeGeometry(0.016, 0.046, 24);
      noseGeo.rotateX(Math.PI * 0.38);
      noseGeo.translate(0, -0.014, -0.002);

      // Phantom Depth Occluder Head (RenderOrder = 0)
      const phantomHead = new THREE.Mesh(craniumGeo, phantomOccluderMat);
      phantomHead.renderOrder = 0;
      const phantomNose = new THREE.Mesh(noseGeo, phantomOccluderMat);
      phantomNose.renderOrder = 0;
      headGroup.add(phantomHead, phantomNose);

      // Visible Sculpted Face Mannequin for Studio Mode
      const visibleHead = new THREE.Mesh(craniumGeo.clone(), faceMannequinMat);
      visibleHead.receiveShadow = true;
      visibleHead.renderOrder = 1;
      const visibleNose = new THREE.Mesh(noseGeo.clone(), faceMannequinMat);
      visibleNose.receiveShadow = true;
      visibleNose.renderOrder = 1;
      const mannequinGroup = new THREE.Group();
      mannequinGroup.add(visibleHead, visibleNose);
      headGroup.add(mannequinGroup);

      // Conformal Nose & Cheek Shadow Catcher (RenderOrder = 2)
      const shadowHead = new THREE.Mesh(craniumGeo.clone(), faceShadowMaterial);
      shadowHead.receiveShadow = true;
      shadowHead.renderOrder = 2;
      const shadowNose = new THREE.Mesh(noseGeo.clone(), faceShadowMaterial);
      shadowNose.receiveShadow = true;
      shadowNose.renderOrder = 2;
      headGroup.add(shadowHead, shadowNose);

      rigGroup.add(headGroup);

      // 2. Sculpted Meta Capri LISA Edition Smart Glasses Frame (Origin at Nose Bridge)
      const glassesGroup = new THREE.Group();
      glassesGroup.position.set(0, 0.0, 0.008);

      // Create Rounded Cat-Eye / Rectangular Rim & Lens Pair
      function createRimAndLens(isLeft) {
        const sideSign = isLeft ? -1 : 1;
        const unit = new THREE.Group();
        unit.position.set(sideSign * 0.034, -0.003, 0);

        // Rim Torus sculpted into LISA cat-eye rectangle
        const rimGeo = new THREE.TorusGeometry(0.024, 0.0036, 20, 48);
        rimGeo.scale(1.18, 0.82, 0.9);
        const rimMesh = new THREE.Mesh(rimGeo, frameAcetateMaterial);
        rimMesh.castShadow = true;
        rimMesh.renderOrder = 3;
        unit.add(rimMesh);

        // Optical Curved Lens
        const lensGeo = new THREE.CircleGeometry(0.0235, 36);
        lensGeo.scale(1.18, 0.82, 1.0);
        // Add subtle spherical bulge to lens vertices
        const pos = lensGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i);
          const ly = pos.getY(i);
          const r2 = lx * lx + ly * ly;
          pos.setZ(i, 0.0025 * (1.0 - r2 / 0.0008));
        }
        lensGeo.computeVertexNormals();
        const lensMesh = new THREE.Mesh(lensGeo, lisaLensMaterial);
        lensMesh.position.z = 0.0008;
        lensMesh.renderOrder = 4;
        unit.add(lensMesh);

        // Meta AI Smart Camera Ring & LED on Upper Outer Corner
        const camRingGeo = new THREE.RingGeometry(0.0014, 0.0026, 20);
        const camRing = new THREE.Mesh(camRingGeo, chromeStarMaterial);
        camRing.position.set(sideSign * 0.023, 0.013, 0.0038);
        camRing.renderOrder = 4;
        unit.add(camRing);

        return unit;
      }

      const leftRimUnit = createRimAndLens(true);
      const rightRimUnit = createRimAndLens(false);
      glassesGroup.add(leftRimUnit, rightRimUnit);

      // Nose Bridge Arch
      const bridgeGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 16);
      bridgeGeo.rotateZ(Math.PI / 2);
      const bridgeMesh = new THREE.Mesh(bridgeGeo, frameAcetateMaterial);
      bridgeMesh.position.set(0, 0.004, 0.001);
      bridgeMesh.castShadow = true;
      bridgeMesh.renderOrder = 3;
      glassesGroup.add(bridgeMesh);

      // Articulated Left & Right Temple Arms with Metallic LISA Star Emblem
      function createTempleArm(isLeft) {
        const sideSign = isLeft ? -1 : 1;
        const hingePivot = new THREE.Group();
        hingePivot.position.set(sideSign * 0.064, 0.004, -0.002);

        // Main Acetate Temple Arm extending to ear (-Z)
        const armGeo = new THREE.BoxGeometry(0.0035, 0.0095, 0.135);
        armGeo.translate(0, -0.002, -0.067);
        const armMesh = new THREE.Mesh(armGeo, frameAcetateMaterial);
        armMesh.castShadow = true;
        armMesh.renderOrder = 3;
        hingePivot.add(armMesh);

        // Chrome Hinge Block + LISA Signature 5-Point Star Accent
        const starGeo = new THREE.OctahedronGeometry(0.0042, 0);
        starGeo.scale(0.4, 1.2, 1.2);
        const starMesh = new THREE.Mesh(starGeo, chromeStarMaterial);
        starMesh.position.set(sideSign * 0.0022, -0.001, -0.018);
        starMesh.renderOrder = 4;
        hingePivot.add(starMesh);

        return hingePivot;
      }

      const leftTempleHinge = createTempleArm(true);
      const rightTempleHinge = createTempleArm(false);
      glassesGroup.add(leftTempleHinge, rightTempleHinge);

      rigGroup.add(glassesGroup);

      // 3. 478-Point Face + Illustrative Landmarks Landmark Overlay
      const faceKpGroup = new THREE.Group();
      const facePts = [
        [0, 0.0, 0.012, 0xec4899],         // 168: Nose Bridge Origin
        [-0.0315, -0.003, 0.006, 0x38bdf8],// 468: Left Iris Center (IPD = 63mm)
        [0.0315, -0.003, 0.006, 0x38bdf8], // 473: Right Iris Center
        [-0.066, 0.003, -0.01, 0x22c55e],  // 127: Left Temple Width Anchor
        [0.066, 0.003, -0.01, 0x22c55e],   // 356: Right Temple Width Anchor
        [0, -0.025, 0.018, 0xf59e0b]       // 1: Nose Tip
      ];
      const dotGeo = new THREE.SphereGeometry(0.0028, 12, 12);
      facePts.forEach(([x, y, z, hex]) => {
        const dMesh = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: hex, depthTest: false }));
        dMesh.position.set(x, y, z);
        dMesh.renderOrder = 10;
        faceKpGroup.add(dMesh);
      });

      // Illustrative Landmarks Rings
      [-0.0315, 0.0315].forEach((ix) => {
        const irisRing = new THREE.Mesh(
          new THREE.RingGeometry(0.0056, 0.0062, 24),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, depthTest: false })
        );
        irisRing.position.set(ix, -0.003, 0.007);
        irisRing.renderOrder = 10;
        faceKpGroup.add(irisRing);
      });

      rigGroup.add(faceKpGroup);

      return {
        rigGroup,
        glassesGroup,
        mannequinGroup,
        phantomHead,
        phantomNose,
        leftTempleHinge,
        rightTempleHinge,
        faceKpGroup
      };
    }

    const glassRig = buildMetaLisaEyeglassRig();
    headAnchor.add(glassRig.rigGroup);

    // Boot Shoe GLB loading
    loadShoeFromUrls(SHOE_GLB_URLS)
      .then((gltf) => {
        setupNormalizedShoePair(gltf);
        selectShoeColorwayVariant('street');
        loadingOverlay.classList.add('opacity-0', 'pointer-events-none');
      })
      .catch(() => {
        loadingOverlay.classList.add('opacity-0', 'pointer-events-none');
      });

    // ============================================================================
    // 6. ENGINE MODE SWITCHING (SHOE VTO <-> EYEGLASS VTO) & UI CONTROLS
    // ============================================================================
    let activeEngine = 'shoe'; // 'shoe' | 'glass'
    let motionMode = 'walk';
    let manualToeBendDeg = 20;
    let trouserOverhangPct = 35;
    let manualRollDeg = 0;
    let templeHingeSplayDeg = 4.5;
    let isWebcamActive = false;
    let cameraStarting = false;
    function stopStudioCamera() {
      isWebcamActive = false;
      studioGeneration++; latestFeet = null;
      video.srcObject?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      video.classList.add('hidden');
      controls.enabled = true;
      document.getElementById('webcam-btn-text').textContent = 'Start Live AR';
      lastVideoTime = -1;
      trackingPipeline.reset();
    }
    window.addEventListener('pagehide', stopStudioCamera);

    const modeShoeBtn = document.getElementById('mode-shoe-btn');
    const modeGlassBtn = document.getElementById('mode-glass-btn');
    const shoeVariantsBar = document.getElementById('shoe-variants-bar');
    const glassVariantsBar = document.getElementById('glass-variants-bar');
    const shoeControlsPanel = document.getElementById('shoe-controls-panel');
    const glassControlsPanel = document.getElementById('glass-controls-panel');
    const shoeCamBar = document.getElementById('shoe-cam-bar');
    const glassCamBar = document.getElementById('glass-cam-bar');
    const headerIcon = document.getElementById('header-icon');

    function switchEngineMode(targetMode) {
      if (cameraStarting) return;
      if (isWebcamActive) stopStudioCamera();
      activeEngine = targetMode;
      glassRig.mannequinGroup.visible = document.getElementById('toggle-g-mannequin').checked;
      headAnchor.visible = true;
      if (targetMode === 'shoe') {
        shoeModeRoot.visible = true;
        glassModeRoot.visible = false;
        studioGrid.visible = !isWebcamActive;

        modeShoeBtn.className = 'px-3.5 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-bold transition flex items-center gap-1.5';
        modeGlassBtn.className = 'px-3.5 py-1.5 rounded-lg text-slate-300 hover:text-white font-semibold transition flex items-center gap-1.5';

        shoeVariantsBar.classList.remove('hidden');
        glassVariantsBar.classList.add('hidden');
        glassVariantsBar.classList.remove('flex');
        shoeControlsPanel.classList.remove('hidden');
        glassControlsPanel.classList.add('hidden');
        shoeCamBar.classList.remove('hidden');
        glassCamBar.classList.add('hidden');
        glassCamBar.classList.remove('flex');
        headerIcon.textContent = '👟';

        document.getElementById('hud-mode').textContent = 'Active Engine: Reference Shoe VTO';
        document.getElementById('hud-shader').textContent = 'Shaders: Metatarsal Toe-Flex + Trouser Mask';

        if (!isWebcamActive) {
          camera.position.set(0.46, 0.24, 0.48);
          controls.target.set(0, -0.02, 0.02);
          controls.update();
        }
      } else {
        shoeModeRoot.visible = false;
        glassModeRoot.visible = true;
        studioGrid.visible = false;

        modeGlassBtn.className = 'px-3.5 py-1.5 rounded-lg bg-pink-500 text-slate-950 font-bold transition flex items-center gap-1.5';
        modeShoeBtn.className = 'px-3.5 py-1.5 rounded-lg text-slate-300 hover:text-white font-semibold transition flex items-center gap-1.5';

        shoeVariantsBar.classList.add('hidden');
        glassVariantsBar.classList.remove('hidden');
        glassVariantsBar.classList.add('flex');
        shoeControlsPanel.classList.add('hidden');
        glassControlsPanel.classList.remove('hidden');
        shoeCamBar.classList.add('hidden');
        glassCamBar.classList.remove('hidden');
        glassCamBar.classList.add('flex');
        headerIcon.textContent = '🕶️';

        document.getElementById('hud-mode').textContent = 'Active Engine: Designer Eyeglass VTO';
        document.getElementById('hud-shader').textContent = 'Shaders: Dual-Coat Fresnel (IOR 1.523) + Nose Shadow';

        if (!isWebcamActive) {
          camera.position.set(0.0, 0.01, 0.28);
          controls.target.set(0, -0.005, -0.01);
          controls.update();
        }
      }
    }

    modeShoeBtn.addEventListener('click', () => switchEngineMode('shoe'));
    modeGlassBtn.addEventListener('click', () => switchEngineMode('glass'));

    // Eyeglass Edition Switcher
    document.querySelectorAll('.gstyle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gstyle-btn').forEach((b) => {
          b.className = 'gstyle-btn px-2.5 py-1 rounded-md text-slate-300 hover:text-white transition';
        });
        btn.className = 'gstyle-btn px-2.5 py-1 rounded-md bg-pink-500 text-slate-950 font-semibold transition';

        const style = btn.dataset.gstyle;
        if (style === 'lisa_pink') {
          lensUniforms.uTopColor.value.setHex(0xff5ca8);
          lensUniforms.uBottomColor.value.setHex(0xffd6e7);
          frameAcetateMaterial.color.setHex(0x16161d);
        } else if (style === 'amber_gold') {
          lensUniforms.uTopColor.value.setHex(0xd97706);
          lensUniforms.uBottomColor.value.setHex(0xfef08a);
          frameAcetateMaterial.color.setHex(0x291d12);
        } else if (style === 'cyber_obsidian') {
          lensUniforms.uTopColor.value.setHex(0x0284c7);
          lensUniforms.uBottomColor.value.setHex(0x38bdf8);
          frameAcetateMaterial.color.setHex(0x090d16);
        }
      });
    });

    // Eyeglass Sliders & Toggles
    document.getElementById('slider-g-trans').addEventListener('input', (e) => {
      lisaLensMaterial.transmission = parseFloat(e.target.value);
      document.getElementById('val-g-trans').textContent = e.target.value;
    });

    document.getElementById('slider-g-hinge').addEventListener('input', (e) => {
      templeHingeSplayDeg = parseFloat(e.target.value);
      document.getElementById('val-g-hinge').textContent = `${templeHingeSplayDeg}°`;
    });

    document.getElementById('slider-g-shadow').addEventListener('input', (e) => {
      faceShadowMaterial.opacity = parseFloat(e.target.value);
      document.getElementById('val-g-shadow').textContent = e.target.value;
    });

    document.getElementById('slider-g-temp').addEventListener('input', (e) => {
      const k = parseFloat(e.target.value);
      document.getElementById('val-g-temp').textContent = `${k}K`;
      // Convert Kelvin to warm/cool RGB tint
      const tNorm = (k - 2800) / (6500 - 2800);
      const col = new THREE.Color().lerpColors(new THREE.Color(0xffb46b), new THREE.Color(0xe0f2fe), tNorm);
      keyLight.color.copy(col);
    });

    document.getElementById('toggle-g-occluder').addEventListener('change', (e) => {
      glassRig.phantomHead.visible = e.target.checked;
      glassRig.phantomNose.visible = e.target.checked;
    });

    document.getElementById('toggle-g-mannequin').addEventListener('change', (e) => {
      glassRig.mannequinGroup.visible = e.target.checked;
    });

    document.getElementById('toggle-g-landmarks').addEventListener('change', (e) => {
      glassRig.faceKpGroup.visible = e.target.checked;
    });

    // Eyeglass Camera Presets
    document.querySelectorAll('.gcam-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isWebcamActive) return;
        const mode = btn.dataset.gcam;
        if (mode === 'front') {
          camera.position.set(0.0, 0.01, 0.28);
          controls.target.set(0, -0.005, -0.01);
        } else if (mode === 'quarter') {
          camera.position.set(0.14, 0.04, 0.24);
          controls.target.set(0, 0.0, -0.01);
        } else if (mode === 'temple') {
          camera.position.set(0.22, 0.02, 0.04);
          controls.target.set(0.04, 0.0, -0.04);
        } else if (mode === 'bridge') {
          camera.position.set(0.05, -0.02, 0.14);
          controls.target.set(0, -0.005, 0.0);
        }
        controls.update();
      });
    });

    // Shoe Controls
    const sliderToeBend = document.getElementById('slider-toebend');
    const sliderTrouser = document.getElementById('slider-trouser');
    const sliderRoll = document.getElementById('slider-roll');
    const sliderShadow = document.getElementById('slider-shadow');
    const sliderBeta = document.getElementById('slider-beta');

    const rightFilter = new PoseFilter3D(1.2, 0.08);
    const leftFilter = new PoseFilter3D(1.2, 0.08);
    const faceFilter = new PoseFilter3D(1.4, 0.09);

    document.querySelectorAll('.variant-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.variant-btn').forEach((b) => {
          b.className = 'variant-btn px-2.5 py-1 rounded-md text-slate-300 hover:text-white transition';
        });
        btn.className = 'variant-btn px-2.5 py-1 rounded-md bg-sky-500 text-slate-950 font-semibold transition';
        await selectShoeColorwayVariant(btn.dataset.variant);
      });
    });

    document.querySelectorAll('.motion-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        motionMode = btn.dataset.motion;
        document.querySelectorAll('.motion-btn').forEach((b) => {
          b.className = 'motion-btn py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700';
        });
        btn.className = 'motion-btn py-1.5 rounded-lg bg-sky-500 text-slate-950 font-semibold';
        document.getElementById('motion-label').textContent = btn.textContent;
      });
    });

    document.querySelectorAll('.cam-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (isWebcamActive) return;
        const mode = btn.dataset.cam;
        if (mode === 'side') {
          camera.position.set(0.46, 0.22, 0.46);
          controls.target.set(0, -0.02, 0.02);
        } else if (mode === 'pov') {
          camera.position.set(0.0, 0.68, -0.18);
          controls.target.set(0, -0.05, 0.06);
        } else if (mode === 'mirror') {
          camera.position.set(0.0, 0.14, 0.62);
          controls.target.set(0, -0.03, 0.0);
        } else if (mode === 'heel') {
          camera.position.set(-0.35, 0.25, -0.42);
          controls.target.set(0, 0.0, -0.02);
        }
        controls.update();
      });
    });

    sliderToeBend.addEventListener('input', (e) => {
      manualToeBendDeg = parseFloat(e.target.value);
      motionMode = 'manual';
      document.getElementById('val-toebend').textContent = `${manualToeBendDeg}°`;
    });

    sliderTrouser.addEventListener('input', (e) => {
      trouserOverhangPct = parseFloat(e.target.value);
      document.getElementById('val-trouser').textContent = `${trouserOverhangPct}%`;
    });

    sliderRoll.addEventListener('input', (e) => {
      manualRollDeg = parseFloat(e.target.value);
      motionMode = 'manual';
      document.getElementById('val-roll').textContent = `${manualRollDeg}°`;
    });

    sliderShadow.addEventListener('input', (e) => {
      shadowMaterial.opacity = parseFloat(e.target.value);
      document.getElementById('val-shadow').textContent = e.target.value;
    });

    sliderBeta.addEventListener('input', (e) => {
      const b = parseFloat(e.target.value);
      rightFilter.setBeta(b);
      leftFilter.setBeta(b);
      faceFilter.setBeta(b);
      document.getElementById('val-beta').textContent = b.toFixed(2);
    });

    const toggleOccluder = document.getElementById('toggle-occluder');
    const toggleLegProxy = document.getElementById('toggle-leg-proxy');
    const toggleDualFoot = document.getElementById('toggle-dual-foot');
    const toggleKeypoints = document.getElementById('toggle-keypoints');

    function updateShoeOccluderMaterials() {
      const enabled = toggleOccluder.checked;
      const showVisible = toggleLegProxy.checked;
      [rightRig, leftRig].forEach((rig) => {
        rig.legMesh.visible = enabled;
        rig.cuffMesh.visible = enabled && trouserOverhangPct > 2;
        rig.legMesh.material = showVisible ? skinProxyMat : phantomOccluderMat;
        rig.cuffMesh.material = showVisible ? denimProxyMat : phantomOccluderMat;
        rig.legMesh.renderOrder = showVisible ? 1 : 0;
        rig.cuffMesh.renderOrder = showVisible ? 1 : 0;
      });
    }

    toggleOccluder.addEventListener('change', updateShoeOccluderMaterials);
    toggleLegProxy.addEventListener('change', updateShoeOccluderMaterials);
    toggleDualFoot.addEventListener('change', () => { leftFootAnchor.visible = toggleDualFoot.checked; });
    toggleKeypoints.addEventListener('change', () => {
      rightRig.kpGroup.visible = toggleKeypoints.checked;
      leftRig.kpGroup.visible = toggleKeypoints.checked;
    });

    // Custom GLB Upload (Auto-routes to active engine!)
    document.getElementById('custom-glb-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      loadingOverlay.classList.remove('opacity-0', 'pointer-events-none');
      loadingStatus.textContent = `Calibrating Custom 3D Asset: ${file.name}...`;
      try {
      const gltf = await gltfLoader.loadAsync(url);

      if (activeEngine === 'shoe') {
        setupNormalizedShoePair(gltf);
      } else {
        // Normalize custom Eyeglass GLB to 140mm width at Nose Bridge
        const customGlass = gltf.scene;
        const box = new THREE.Box3().setFromObject(customGlass);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        customGlass.position.sub(center);
        const scale = 0.142 / Math.max(size.x, 0.01);
        const wrapper = new THREE.Group();
        wrapper.add(customGlass);
        wrapper.scale.setScalar(scale);
        wrapper.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.renderOrder = 3; } });
        glassRig.rigGroup.remove(glassRig.glassesGroup);
        glassRig.glassesGroup = wrapper;
        glassRig.rigGroup.add(wrapper);
      }
      } catch (error) { alert('Model could not be loaded: ' + error.message); }
      finally { URL.revokeObjectURL(url); loadingOverlay.classList.add('opacity-0', 'pointer-events-none'); }
    });

    // ============================================================================
    // 7. LIVE WEBCAM AR TRACKING (DUAL MEDIAPIPE GPU POSE + FACE LANDMARKERS)
    // ============================================================================
    let visionResolver = null;
    const footNet = new FootNetInferenceEngine();
    let footBusy = false, lastFootStart = -Infinity, studioGeneration = 0;
    let latestFeet = null;

    footNet.on('ready', ({ release }) => { document.getElementById('hud-mode').textContent = 'FootNet: ' + release.id; });
    let faceLandmarker = null;
    let poseLandmarker = null;
    const opticalFootDetector = new OpticalFootDetector();
    const poseDetector = new PoseDetector();
    const trackingPipeline = new FootTrackingPipeline(footNet,opticalFootDetector,poseDetector);
    const trackingOverlay = new FootTrackingOverlay(container,opticalFootDetector,()=>trackingPipeline.reset());
    trackingOverlay.bar.style.bottom='64px';
    canvas.addEventListener('pointerdown', e=>{
      if(!isWebcamActive || activeEngine!=='shoe')return;
      const r=canvas.getBoundingClientRect();
      trackingOverlay.tap(video,e.clientX-r.left,e.clientY-r.top,r.width,r.height);
    });
    let lastVideoTime = -1;
    let lastShoeVideoTime = -1;
    let lastSuccessfulFootDetectionMs = 0;
    let lastDetectedFootSource = 'Scanning';

    // 16x16 Offscreen Canvas for Live Webcam Room Light Probe
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 16;
    probeCanvas.height = 16;
    const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });

    function updateRoomLightFromWebcam() {
      if (!isWebcamActive || video.readyState < 2) return;
      probeCtx.drawImage(video, 0, 0, 16, 16);
      const data = probeCtx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      const n = data.length / 4;
      const roomColor = new THREE.Color(r / (n * 255), g / (n * 255), b / (n * 255));
      ambientLight.color.lerp(roomColor, 0.15);
      keyLight.color.lerp(roomColor.clone().lerp(new THREE.Color(0xffffff), 0.5), 0.15);
    }

    document.getElementById('webcam-btn').addEventListener('click', async () => {
      if (cameraStarting) return;
      const btnText = document.getElementById('webcam-btn-text');
      if (isWebcamActive) {
        studioGeneration++; latestFeet = null;
        isWebcamActive = false;
        const stream = video.srcObject;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        video.classList.add('hidden');
        glassRig.mannequinGroup.visible = document.getElementById('toggle-g-mannequin').checked;
        btnText.textContent = 'Start Live AR';
        switchEngineMode(activeEngine);
        controls.enabled = true;
        return;
      }

      cameraStarting = true;
      try {
        btnText.textContent = 'Loading AI...';
        if (activeEngine === 'glass' && !visionResolver) {
          try {
            visionResolver = await FilesetResolver.forVisionTasks(
              import.meta.env.BASE_URL + 'wasm'
            );
          } catch (wErr) {
            visionResolver = await FilesetResolver.forVisionTasks(
              'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
            );
          }
        }

        if (activeEngine === 'shoe') {
          footNet.init().catch(e=>console.warn('FootNet warmup:',e));
          if(!poseDetector.isLoaded) poseDetector.init().catch(e=>console.warn('Pose warmup:',e));
        } else if (!faceLandmarker) {
          faceLandmarker = await FaceLandmarker.createFromOptions(visionResolver, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numFaces: 1
          });
        }

        const facingMode = activeEngine === 'glass' ? 'user' : { ideal: 'environment' };
        let stream = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
        } catch (camErr) {
          console.warn('[Studio] Camera constraint fallback:', camErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
        video.srcObject = stream;
        await video.play();
        video.classList.remove('hidden');

        studioGrid.visible = false;
        glassRig.mannequinGroup.visible = false; // Hide dummy head in Live AR so only Phantom Occluder + Shadow Catcher remain!
        controls.enabled = false;
        camera.position.set(0, 0, 0);
        camera.rotation.set(0, 0, 0);

        studioGeneration++; latestFeet = null;
        lastVideoTime = -1;
        lastShoeVideoTime = -1;
        lastSuccessfulFootDetectionMs = 0;
        headAnchor.visible = false;
        rightFootAnchor.visible = leftFootAnchor.visible = false;
        trackingPipeline.reset();
        isWebcamActive = true;
        btnText.textContent = 'Stop Live AR';
      } catch (err) {
        stopStudioCamera();
        cameraStarting = false;
        switchEngineMode(activeEngine);
        alert('Camera error: ' + err.message);
        btnText.textContent = 'Start Live AR';
      } finally { cameraStarting = false; }
    });

    function viewportLandmarks(points) {
      return points.map(point => {
        const p = videoPointToScreen(point, container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight);
        return { ...point, x: p.screenX / container.clientWidth, y: p.screenY / container.clientHeight };
      });
    }

    function solveFaceEyeglass6DoF(lm, filter, nowMs, W, H, fy) {
      // Key Landmarks: 168 (Nose Bridge Origin), 33 & 263 (Outer Eyes), 127 & 356 (Temples), 10 (Forehead), 152 (Chin)
      const bridgeLm = lm[168];
      const leftEyeLm = lm[33];
      const rightEyeLm = lm[263];
      const leftTempleLm = lm[127];
      const rightTempleLm = lm[356];
      const foreheadLm = lm[10];
      const chinLm = lm[152];

      if (!bridgeLm || !leftEyeLm || !rightEyeLm) return null;

      // True Metric Calibration using 63mm average Bi-Ocular / IPD span
      const REAL_EYE_SPAN_M = 0.092;
      const eyeSpanPx = Math.max(
        Math.hypot((rightEyeLm.x - leftEyeLm.x) * W, (rightEyeLm.y - leftEyeLm.y) * H),
        24
      );
      const baseZ = -(fy * REAL_EYE_SPAN_M) / eyeSpanPx;

      const unproject = (p) => {
        const z = baseZ - p.z * 0.14;
        const x = ((p.x * W - W / 2) * -z) / fy;
        const y = -((p.y * H - H / 2) * -z) / fy;
        return new THREE.Vector3(x, y, z);
      };

      const pBridge = unproject(bridgeLm);
      const pLeftEye = unproject(leftEyeLm);
      const pRightEye = unproject(rightEyeLm);
      const pForehead = unproject(foreheadLm);
      const pChin = unproject(chinLm);
      const pTempleL = unproject(leftTempleLm);
      const pTempleR = unproject(rightTempleLm);

      const vRight = new THREE.Vector3().subVectors(pRightEye, pLeftEye).normalize();
      const vUpRaw = new THREE.Vector3().subVectors(pForehead, pChin).normalize();
      const vFwd = new THREE.Vector3().crossVectors(vRight, vUpRaw).normalize();
      const vUp = new THREE.Vector3().crossVectors(vFwd, vRight).normalize();

      const rotMat = new THREE.Matrix4().makeBasis(vRight, vUp, vFwd);
      const rawQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

      const smoothPos = filter.filterPos(pBridge, nowMs);
      const smoothQuat = filter.filterQuat(rawQuat, 0.42);
      const templeWidthM = pTempleL.distanceTo(pTempleR);
      const scale = THREE.MathUtils.clamp(templeWidthM / 0.138, 0.78, 1.32);

      // Dynamic Temple Hinge Splay angle in radians
      const splayRad = THREE.MathUtils.clamp((templeWidthM - 0.135) * 1.9, -0.04, 0.18);

      return { smoothPos, smoothQuat, scale, splayRad, templeWidthMm: templeWidthM * 1000 };
    }

    // ============================================================================
    // 8. MAIN 60 FPS RENDER LOOP
    // ============================================================================
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    function animate() {
      requestAnimationFrame(animate);
      const nowMs = performance.now();
      const t = nowMs * 0.001;

      frameCount++;
      if (nowMs - lastFpsUpdate > 500) {
        const fps = Math.round((frameCount * 1000) / (nowMs - lastFpsUpdate));
        document.getElementById('hud-fps').textContent = `${fps} FPS | WebGL2 PBR`;
        frameCount = 0;
        lastFpsUpdate = nowMs;
        if (isWebcamActive) updateRoomLightFromWebcam();
      }

      if (activeEngine === 'shoe') {
        // ---------------- SHOE ENGINE UPDATE ----------------
        const cuffNorm = trouserOverhangPct / 100.0;
        [rightRig, leftRig].forEach((rig) => {
          rig.legMesh.visible = !isWebcamActive && toggleOccluder.checked;
          rig.cuffMesh.visible = !isWebcamActive && toggleOccluder.checked && trouserOverhangPct > 2;
          rig.cuffMesh.position.y = 0.045 - cuffNorm * 0.068;
          rig.cuffMesh.scale.set(1.0 + cuffNorm * 0.25, 1.0, 1.0 + cuffNorm * 0.28);
        });

        if (!isWebcamActive) {
          groundShadowPlane.visible = true;
          controls.update();
          let activeToeBendDeg = manualToeBendDeg;
          let activeRollDeg = manualRollDeg;

          if (motionMode === 'walk') {
            activeToeBendDeg = 18 + Math.sin(t * 2.6) * 16;
            activeRollDeg = Math.cos(t * 1.3) * 4;
            sliderToeBend.value = Math.round(activeToeBendDeg);
            document.getElementById('val-toebend').textContent = `${Math.round(activeToeBendDeg)}°`;
          } else if (motionMode === 'roll') {
            activeToeBendDeg = 8;
            activeRollDeg = Math.sin(t * 2.2) * 18;
            sliderRoll.value = Math.round(activeRollDeg);
            document.getElementById('val-roll').textContent = `${Math.round(activeRollDeg)}°`;
          }

          const toeBendRad = THREE.MathUtils.degToRad(activeToeBendDeg);
          const rollRad = THREE.MathUtils.degToRad(activeRollDeg);

          deformShoeVerticesForToeFlex(rightShoeContainer, toeBendRad);
          deformShoeVerticesForToeFlex(leftShoeContainer, toeBendRad * 0.65);

          const spacing = toggleDualFoot.checked ? 0.115 : 0.0;
          rightFootAnchor.visible = true;
          rightFootAnchor.position.set(spacing, Math.sin(toeBendRad) * 0.042, 0);
          rightFootAnchor.rotation.set(toeBendRad * 0.42, 0, rollRad);
          rightFootAnchor.scale.setScalar(1.0);

          leftFootAnchor.visible = toggleDualFoot.checked;
          const leftBendRad = toeBendRad * 0.65;
          leftFootAnchor.position.set(-spacing, Math.sin(leftBendRad) * 0.03, -0.035);
          leftFootAnchor.rotation.set(leftBendRad * 0.38, 0.04, -rollRad * 0.8);
          leftFootAnchor.scale.setScalar(1.0);

          document.getElementById('hud-pose').textContent =
            `Toe Bend: ${activeToeBendDeg.toFixed(1)}° | Cuff Overhang: ${trouserOverhangPct}%`;
        } else {
          const W = container.clientWidth, H = container.clientHeight;
          const result=trackingPipeline.detect(video,W,H,false,nowMs);
          trackingOverlay.draw(result,video,W,H);
          for(const [root,heelIndex,toeIndex,filter,enabled] of [
            [leftFootAnchor,29,31,leftFilter,toggleDualFoot.checked],[rightFootAnchor,30,32,rightFilter,true]
          ]) {
            const wasVisible=root.visible;root.visible=false;
            const heel=result?.landmarks[heelIndex],toe=result?.landmarks[toeIndex];
            if(!enabled||!heel||!toe)continue;
            const map=p=>videoPointToScreen(p,W,H,video.videoWidth,video.videoHeight);
            const fit=fitScreenFoot(map(heel),map(toe),W,H,45,shoeRenderBounds);
            if(!fit)continue;
            if(!wasVisible) {
              for(const axis of [filter.fx,filter.fy,filter.fz]) {axis.x=new LowPassFilter();axis.dx=new LowPassFilter();axis.lastTime=null;}
              filter.lastQuat=null;
            }
            root.position.copy(filter.filterPos(fit.position,nowMs));root.quaternion.copy(filter.filterQuat(fit.quaternion));
            root.scale.setScalar(fit.scale);root.visible=true;
          }
          groundShadowPlane.visible=false;
          document.getElementById('hud-pose').textContent=result ? result.source+' • visual estimate' : 'Feet not found • Tap to track, then tap foot centre';
          // Reset toe flex when not in manual deformation mode
          deformShoeVerticesForToeFlex(rightShoeContainer, 0);
          deformShoeVerticesForToeFlex(leftShoeContainer, 0);
        }
      } else {
        // ---------------- EYEGLASS ENGINE UPDATE ----------------
        const splayRad = THREE.MathUtils.degToRad(templeHingeSplayDeg);
        glassRig.leftTempleHinge.rotation.y = -splayRad;
        glassRig.rightTempleHinge.rotation.y = splayRad;

        if (!isWebcamActive) {
          controls.update();
          const autoTurn = document.getElementById('toggle-g-autoturn').checked;
          if (autoTurn) {
            headAnchor.rotation.y = Math.sin(t * 1.35) * 0.34;
            headAnchor.rotation.x = Math.cos(t * 0.9) * 0.08;
          } else {
            headAnchor.rotation.set(0, 0, 0);
          }
          headAnchor.position.set(0, 0, 0);
          headAnchor.scale.setScalar(1.0);
          document.getElementById('hud-pose').textContent =
            `Demo eye spacing: 63mm (assumed) | Hinge Splay: +${templeHingeSplayDeg.toFixed(1)}°`;
        } else if (faceLandmarker && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const W = container.clientWidth;
          const H = container.clientHeight;
          const fy = H / (2 * Math.tan((45 * Math.PI) / 360));
          headAnchor.visible = false;
          const res = faceLandmarker.detectForVideo(video, nowMs);

          if (res.faceLandmarks && res.faceLandmarks.length > 0) {
            const fPose = solveFaceEyeglass6DoF(viewportLandmarks(res.faceLandmarks[0]), faceFilter, nowMs, W, H, fy);
            if (fPose) {
              headAnchor.visible = true;
              headAnchor.position.copy(fPose.smoothPos);
              headAnchor.quaternion.copy(fPose.smoothQuat);
              headAnchor.scale.setScalar(fPose.scale);
              glassRig.leftTempleHinge.rotation.y = -fPose.splayRad;
              glassRig.rightTempleHinge.rotation.y = fPose.splayRad;
              document.getElementById('hud-pose').textContent =
                `Visual width estimate: ${fPose.templeWidthMm.toFixed(0)}mm | Auto Hinge: ${(THREE.MathUtils.radToDeg(fPose.splayRad)).toFixed(1)}°`;
            }
          } else {
            headAnchor.visible = false;
          }
        }
      }

      const zoom = isWebcamActive ? 1 : Math.min(1, Math.max(0.55, camera.aspect / 0.9));
      if (camera.zoom !== zoom) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
      trackingOverlay.bar.style.display = isWebcamActive && activeEngine === 'shoe' ? 'flex' : 'none';
      trackingOverlay.canvas.hidden = !isWebcamActive || activeEngine !== 'shoe';
      renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      trackingPipeline.reset();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    updateShoeOccluderMaterials();
    rightRig.kpGroup.visible = leftRig.kpGroup.visible = toggleKeypoints.checked;
    animate();
  