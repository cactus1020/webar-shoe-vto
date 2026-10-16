/**
 * ProceduralSneaker.js - Photorealistic 3D Footwear Engine
 * Features WANNA-grade luxury loafers, chunky lug soles, metallic buckles,
 * and high-end sneaker silhouettes with PBR materials and contact ground shadows.
 */
import * as THREE from 'three';

export const SNEAKER_STYLES = {
  'retro-white': {
    id: 'retro-white',
    name: 'Retro White Heritage',
    tagline: 'Classic Court Leather & Gum Sole',
    price: '$180',
    type: 'sneaker',
    colors: {
      outsole: 0xc4b295,
      midsole: 0xf8f6f0,
      upper: 0xffffff,
      vamp: 0xedebe6,
      collar: 0x1c2545,
      tongue: 0xf2eee8,
      laces: 0xffffff,
      accents: 0x1c2545,
      emissive: 0x000000,
      emissiveIntensity: 0
    }
  },
  'loafer-black': {
    id: 'loafer-black',
    name: 'Luxury Italian Loafer',
    tagline: 'Gloss Patent Leather & 24K Gold Horsebit',
    price: '$690',
    type: 'loafer',
    colors: {
      outsole: 0x1a1c22,
      midsole: 0x252830,
      upper: 0x181a20,
      vamp: 0x22252e,
      collar: 0x16181f,
      tongue: 0x20232c,
      buckle: 0xffd700,
      accents: 0xffd700,
      emissive: 0x000000,
      emissiveIntensity: 0
    }
  },
  'cyberpunk': {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon V2',
    tagline: 'Futuristic Glow Edition',
    price: '$240',
    type: 'sneaker',
    colors: {
      outsole: 0x080c16,
      midsole: 0x00f2fe,
      upper: 0x111420,
      vamp: 0x181c2d,
      collar: 0x090c14,
      tongue: 0x161a29,
      laces: 0xf093fb,
      accents: 0x00f2fe,
      emissive: 0x00f2fe,
      emissiveIntensity: 0.95
    }
  },
  'retro-white': {
    id: 'retro-white',
    name: 'Retro White Heritage',
    tagline: 'Classic Court Leather',
    price: '$180',
    type: 'sneaker',
    colors: {
      outsole: 0xc4b295,
      midsole: 0xf8f6f0,
      upper: 0xffffff,
      vamp: 0xedebe6,
      collar: 0x1c2545,
      tongue: 0xf2eee8,
      laces: 0xffffff,
      accents: 0x1c2545,
      emissive: 0x000000,
      emissiveIntensity: 0
    }
  },
  'crimson-sport': {
    id: 'crimson-sport',
    name: 'Sport Crimson GT',
    tagline: 'High-Performance Track',
    price: '$210',
    type: 'sneaker',
    colors: {
      outsole: 0x111111,
      midsole: 0xe61c24,
      upper: 0x1e1f24,
      vamp: 0x282a30,
      collar: 0x111111,
      tongue: 0x25262c,
      laces: 0xe61c24,
      accents: 0xe61c24,
      emissive: 0xe61c24,
      emissiveIntensity: 0.35
    }
  },
  'desert-tan': {
    id: 'desert-tan',
    name: 'Desert Tan Chelsea',
    tagline: 'Urban Outdoor Luxe',
    price: '$195',
    type: 'boot',
    colors: {
      outsole: 0x75502e,
      midsole: 0xc4ab80,
      upper: 0xdfcfb2,
      vamp: 0xd2c0a3,
      collar: 0x543e2b,
      tongue: 0xd0bea0,
      laces: 0x543e2b,
      accents: 0xd4af37,
      emissive: 0x000000,
      emissiveIntensity: 0
    }
  }
};

// Reusable procedural soft ambient ground contact shadow
function createProceduralShadowTexture() {
  const width = 128;
  const height = 256;
  const size = width * height;
  const data = new Uint8Array(4 * size);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const nx = (x - width / 2) / (width / 2);
      const ny = (y - height / 2) / (height / 2);
      const dist = Math.sqrt(nx * nx * 1.35 + ny * ny * 0.85);
      // Smooth cubic falloff to ensure edges fade to pure 0 well inside the quad
      let alpha = 0;
      if (dist < 0.92) {
        const t = 1 - (dist / 0.92);
        alpha = Math.floor(t * t * 140);
      }
      data[idx] = 0;     // R
      data[idx + 1] = 0; // G
      data[idx + 2] = 0; // B
      data[idx + 3] = alpha; // A
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

const sharedShadowTexture = createProceduralShadowTexture();

export class ProceduralSneaker {
  static create(styleId = 'retro-white', isRight = true) {
    const style = SNEAKER_STYLES[styleId] || SNEAKER_STYLES['retro-white'];
    const { colors, type } = style;
    const group = new THREE.Group();
    group.name = 'Shoe_' + styleId + '_' + (isRight ? 'Right' : 'Left');

    // 1. Soft Ambient Floor Contact Shadow Plane
    const shadowPlaneGeom = new THREE.PlaneGeometry(0.18, 0.36);
    shadowPlaneGeom.rotateX(-Math.PI / 2);
    shadowPlaneGeom.translate(0, 0.001, 0.015);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: sharedShadowTexture,
      transparent: true,
      opacity: 0.60,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const shadowMesh = new THREE.Mesh(shadowPlaneGeom, shadowMat);
    shadowMesh.name = 'ContactShadow';
    shadowMesh.userData.isShadow = true;
    shadowMesh.renderOrder = 1;
    group.add(shadowMesh);

    if (type === 'loafer') {
      this.buildLuxuryLoafer(group, colors, isRight);
    } else {
      this.buildAthleticSneaker(group, colors, isRight);
    }

    // Set renderOrder = 1 for all product meshes (Phantom Z-Buffer Depth Pass: 0 -> 1)
    // Cache un-deformed base vertex positions on every mesh for 3D Thin-Plate Spline deformation
    group.traverse((child) => {
      if (child.isMesh) {
        if (!child.userData.isShadow && child.name !== 'ContactShadow') {
          child.renderOrder = 1;
        }
        if (child.geometry && child.geometry.attributes.position) {
          child.userData.basePositions = new Float32Array(child.geometry.attributes.position.array);
        }
      }
    });

    return group;
  }

  /**
   * Builds the Luxury Chunky Loafer (matching WANNA AR reference!)
   */
  static buildLuxuryLoafer(group, colors, isRight) {
    // High-gloss patent leather material
    const leatherMat = new THREE.MeshStandardMaterial({
      color: colors.upper,
      roughness: 0.18,
      metalness: 0.12,
      side: THREE.DoubleSide
    });

    const soleMat = new THREE.MeshStandardMaterial({
      color: colors.outsole,
      roughness: 0.82,
      metalness: 0.08,
      side: THREE.DoubleSide
    });

    const goldBuckleMat = new THREE.MeshStandardMaterial({
      color: colors.buckle,
      roughness: 0.22,
      metalness: 0.95,
      side: THREE.DoubleSide
    });

    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x221810,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // 1. Chunky Lug Outsole (Sculpted Italian Platform Sole)
    const soleShape = new THREE.Shape();
    soleShape.moveTo(-0.046, -0.140);
    soleShape.bezierCurveTo(-0.050, -0.07, -0.052, 0.04, -0.048, 0.120);
    soleShape.bezierCurveTo(-0.042, 0.155, -0.012, 0.165, 0.012, 0.160);
    soleShape.bezierCurveTo(0.044, 0.152, 0.052, 0.07, 0.048, 0.02);
    soleShape.bezierCurveTo(0.042, -0.04, 0.044, -0.08, 0.040, -0.140);
    soleShape.bezierCurveTo(0.022, -0.152, -0.030, -0.152, -0.046, -0.140);

    const soleExtrude = new THREE.ExtrudeGeometry(soleShape, {
      steps: 2,
      depth: 0.026,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.005,
      bevelSegments: 3
    });
    soleExtrude.rotateX(-Math.PI / 2);
    soleExtrude.rotateZ(Math.PI);
    soleExtrude.translate(0, 0.016, 0);

    const soleMesh = new THREE.Mesh(soleExtrude, soleMat);
    soleMesh.castShadow = true;
    group.add(soleMesh);

    // Deep Lug Sole Cleats (Tread pattern underneath)
    for (let z = -0.12; z <= 0.14; z += 0.028) {
      const lugGeom = new THREE.BoxGeometry(0.088, 0.006, 0.012);
      lugGeom.translate(0, 0.004, z);
      const lugMesh = new THREE.Mesh(lugGeom, soleMat);
      group.add(lugMesh);
    }

    // 2. Sculpted Loafer Vamp & Toe Box (Sleek moc-toe stitch shape fully covering toes)
    const toeBoxGeom = new THREE.SphereGeometry(0.048, 28, 20);
    toeBoxGeom.scale(0.94, 0.52, 1.55);
    toeBoxGeom.rotateX(0.08);
    toeBoxGeom.translate(0, 0.036, 0.092);
    const toeBoxMesh = new THREE.Mesh(toeBoxGeom, leatherMat);
    toeBoxMesh.castShadow = true;
    group.add(toeBoxMesh);

    // Moc-toe apron ridge stitching
    const apronShape = new THREE.TorusGeometry(0.040, 0.0045, 12, 24, Math.PI * 1.15);
    apronShape.rotateX(Math.PI / 2.2);
    apronShape.translate(0, 0.052, 0.096);
    const apronMesh = new THREE.Mesh(apronShape, leatherMat);
    group.add(apronMesh);

    // 3. Midfoot Upper & Instep Strap (Penny loafer / horsebit strap)
    const midUpperGeom = new THREE.CylinderGeometry(0.042, 0.048, 0.12, 24);
    midUpperGeom.scale(0.95, 0.60, 1.15);
    midUpperGeom.rotateX(Math.PI / 3.4);
    midUpperGeom.translate(0, 0.048, 0.005);
    const midUpperMesh = new THREE.Mesh(midUpperGeom, leatherMat);
    midUpperMesh.castShadow = true;
    group.add(midUpperMesh);

    // Cross-strap across instep
    const strapGeom = new THREE.BoxGeometry(0.086, 0.008, 0.024);
    strapGeom.rotateX(Math.PI / 6);
    strapGeom.translate(0, 0.062, 0.035);
    const strapMesh = new THREE.Mesh(strapGeom, leatherMat);
    group.add(strapMesh);

    // 4. Gold Chain / Horsebit Metal Buckle (WANNA Iconic Luxury Detail!)
    const buckleGroup = new THREE.Group();
    
    // Central gold bar / link
    const centerLinkGeom = new THREE.TorusGeometry(0.012, 0.0035, 16, 24);
    centerLinkGeom.scale(1.3, 0.65, 1.0);
    const centerLink = new THREE.Mesh(centerLinkGeom, goldBuckleMat);
    centerLink.position.set(0, 0, 0);
    buckleGroup.add(centerLink);

    // Left gold ring
    const leftLinkGeom = new THREE.TorusGeometry(0.010, 0.003, 14, 20);
    const leftLink = new THREE.Mesh(leftLinkGeom, goldBuckleMat);
    leftLink.position.set(-0.024, 0, 0);
    buckleGroup.add(leftLink);

    // Right gold ring
    const rightLink = leftLink.clone();
    rightLink.position.set(0.024, 0, 0);
    buckleGroup.add(rightLink);

    // Gold connector bar
    const barGeom = new THREE.CylinderGeometry(0.0028, 0.0028, 0.064, 12);
    barGeom.rotateZ(Math.PI / 2);
    const barMesh = new THREE.Mesh(barGeom, goldBuckleMat);
    buckleGroup.add(barMesh);

    buckleGroup.rotateX(Math.PI / 5);
    buckleGroup.position.set(0, 0.069, 0.038);
    group.add(buckleGroup);

    // 5. Heel Cup & Ankle Collar (open-ended so leg occluder enters cavity)
    const heelCupGeom = new THREE.CylinderGeometry(0.044, 0.042, 0.075, 24, 1, true);
    heelCupGeom.scale(0.90, 1.0, 1.15);
    heelCupGeom.translate(0, 0.052, -0.088);
    const heelCupMesh = new THREE.Mesh(heelCupGeom, leatherMat);
    heelCupMesh.castShadow = true;
    group.add(heelCupMesh);

    // Hollow ankle opening ring
    const collarOpeningGeom = new THREE.TorusGeometry(0.035, 0.008, 16, 24);
    collarOpeningGeom.rotateX(Math.PI / 2.2);
    collarOpeningGeom.scale(0.88, 1.25, 0.88);
    collarOpeningGeom.translate(0, 0.084, -0.075);
    const collarMesh = new THREE.Mesh(collarOpeningGeom, leatherMat);
    group.add(collarMesh);

    // Interior lining
    const interiorGeom = new THREE.CylinderGeometry(0.032, 0.030, 0.055, 20);
    interiorGeom.translate(0, 0.060, -0.075);
    const interiorMesh = new THREE.Mesh(interiorGeom, innerMat);
    group.add(interiorMesh);
  }

  /**
   * Builds the High-Performance Sneaker model
   */
  static buildAthleticSneaker(group, colors, isRight) {
    const outsoleMat = new THREE.MeshStandardMaterial({
      color: colors.outsole,
      roughness: 0.85,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const midsoleMat = new THREE.MeshStandardMaterial({
      color: colors.midsole,
      roughness: 0.35,
      metalness: 0.15,
      emissive: colors.emissive || 0x000000,
      emissiveIntensity: (colors.emissiveIntensity || 0) * 0.4,
      side: THREE.DoubleSide
    });

    const upperMat = new THREE.MeshStandardMaterial({
      color: colors.upper,
      roughness: 0.55,
      metalness: 0.08,
      side: THREE.DoubleSide
    });

    const vampMat = new THREE.MeshStandardMaterial({
      color: colors.vamp,
      roughness: 0.60,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    const collarMat = new THREE.MeshStandardMaterial({
      color: colors.collar,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    const tongueMat = new THREE.MeshStandardMaterial({
      color: colors.tongue,
      roughness: 0.65,
      metalness: 0.08,
      side: THREE.DoubleSide
    });

    const lacesMat = new THREE.MeshStandardMaterial({
      color: colors.laces || 0xffffff,
      roughness: 0.30,
      metalness: 0.20,
      emissive: colors.emissive || 0x000000,
      emissiveIntensity: (colors.emissiveIntensity || 0) * 0.6,
      side: THREE.DoubleSide
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: colors.accents,
      roughness: 0.25,
      metalness: 0.40,
      emissive: colors.emissive || 0x000000,
      emissiveIntensity: colors.emissiveIntensity || 0,
      side: THREE.DoubleSide
    });

    // 1. Sculpted Midsole & Sole
    const soleShape = new THREE.Shape();
    soleShape.moveTo(-0.040, -0.140);
    soleShape.bezierCurveTo(-0.044, -0.07, -0.048, 0.04, -0.046, 0.120);
    soleShape.bezierCurveTo(-0.040, 0.155, -0.010, 0.165, 0.012, 0.160);
    soleShape.bezierCurveTo(0.044, 0.152, 0.050, 0.07, 0.044, 0.02);
    soleShape.bezierCurveTo(0.036, -0.04, 0.038, -0.08, 0.034, -0.140);
    soleShape.bezierCurveTo(0.020, -0.152, -0.028, -0.152, -0.040, -0.140);

    const extrudeSettings = {
      steps: 2,
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 3
    };

    const midsoleGeom = new THREE.ExtrudeGeometry(soleShape, extrudeSettings);
    midsoleGeom.rotateX(-Math.PI / 2);
    midsoleGeom.rotateZ(Math.PI);
    midsoleGeom.translate(0, 0.014, 0);

    const midsoleMesh = new THREE.Mesh(midsoleGeom, midsoleMat);
    midsoleMesh.castShadow = true;
    group.add(midsoleMesh);

    const outsoleGeom = new THREE.BoxGeometry(0.086, 0.006, 0.305);
    outsoleGeom.translate(0, 0.003, 0.010);
    const outsoleMesh = new THREE.Mesh(outsoleGeom, outsoleMat);
    group.add(outsoleMesh);

    // 2. Toe Box & Vamp (Enclosing the entire forefoot & all 5 toes)
    const toeBoxGeom = new THREE.SphereGeometry(0.048, 24, 16);
    toeBoxGeom.scale(0.96, 0.54, 1.55);
    toeBoxGeom.rotateX(0.10);
    toeBoxGeom.translate(0, 0.034, 0.092);
    const toeBoxMesh = new THREE.Mesh(toeBoxGeom, vampMat);
    toeBoxMesh.castShadow = true;
    group.add(toeBoxMesh);

    // Midfoot Upper
    const midUpperGeom = new THREE.CylinderGeometry(0.040, 0.046, 0.12, 20);
    midUpperGeom.scale(0.96, 0.65, 1.15);
    midUpperGeom.rotateX(Math.PI / 3.4);
    midUpperGeom.translate(0, 0.048, 0.008);
    const midUpperMesh = new THREE.Mesh(midUpperGeom, upperMat);
    midUpperMesh.castShadow = true;
    group.add(midUpperMesh);

    // Heel Cup (open-ended so leg occluder enters cavity)
    const heelCupGeom = new THREE.CylinderGeometry(0.044, 0.040, 0.075, 20, 1, true);
    heelCupGeom.scale(0.90, 1.0, 1.15);
    heelCupGeom.translate(0, 0.052, -0.088);
    const heelCupMesh = new THREE.Mesh(heelCupGeom, collarMat);
    heelCupMesh.castShadow = true;
    group.add(heelCupMesh);

    // 3. Collar Opening (matching ankle position at Z = -0.075)
    const collarOpeningGeom = new THREE.TorusGeometry(0.035, 0.010, 16, 24);
    collarOpeningGeom.rotateX(Math.PI / 2.3);
    collarOpeningGeom.scale(0.88, 1.20, 0.88);
    collarOpeningGeom.translate(0, 0.084, -0.075);
    const collarMesh = new THREE.Mesh(collarOpeningGeom, collarMat);
    group.add(collarMesh);

    // 4. Tongue & Lacing System
    const tongueGeom = new THREE.BoxGeometry(0.040, 0.008, 0.105);
    tongueGeom.rotateX(-Math.PI / 4.2);
    tongueGeom.translate(0, 0.072, 0.022);
    const tongueMesh = new THREE.Mesh(tongueGeom, tongueMat);
    group.add(tongueMesh);

    const laceZPositions = [-0.012, 0.016, 0.044, 0.072];
    laceZPositions.forEach((zPos, index) => {
      const laceGeom = new THREE.CylinderGeometry(0.0025, 0.0025, 0.044 - index * 0.003, 8);
      laceGeom.rotateZ(Math.PI / 2);
      laceGeom.translate(0, 0.056 + (4 - index) * 0.0048, zPos);
      const laceMesh = new THREE.Mesh(laceGeom, lacesMat);
      group.add(laceMesh);
    });

    // 5. Accent Swooshes
    const createAccentStripe = (isLateral) => {
      const x = isLateral ? 0.044 : -0.044;
      const stripeCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 0.028, 0.075),
        new THREE.Vector3(x * 1.06, 0.046, 0.005),
        new THREE.Vector3(x * 0.92, 0.060, -0.075)
      ]);
      const stripeGeom = new THREE.TubeGeometry(stripeCurve, 16, 0.0035, 8, false);
      return new THREE.Mesh(stripeGeom, accentMat);
    };

    group.add(createAccentStripe(true));
    group.add(createAccentStripe(false));

    // Heel Pull Tab
    const tabGeom = new THREE.BoxGeometry(0.010, 0.026, 0.003);
    tabGeom.rotateX(Math.PI / 7);
    tabGeom.translate(0, 0.088, -0.132);
    const tabMesh = new THREE.Mesh(tabGeom, accentMat);
    group.add(tabMesh);
  }
}

