import { useEffect, useRef } from "react";
import * as THREE from "three";

/** Overlay de victoire "Julo" : le minion 3D se transforme en Super Saiyan.
 *  Chargé en lazy (three.js n'est téléchargé que si l'overlay s'affiche). */
export default function MinionSSJ({
  duration = 7000,
  onDone,
}: {
  duration?: number;
  onDone: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ─── Scène / caméra / rendu ─────────────────────────────────────────────
    const scene = new THREE.Scene();
    const BG_LIGHT = new THREE.Color(0xeef0f5);
    const BG_DARK = new THREE.Color(0x0d1124);
    scene.background = BG_LIGHT.clone();

    const camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.set(0, 2.4, 9);
    camera.lookAt(0, 2.6, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ─── Lumières ───────────────────────────────────────────────────────────
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b6c8, 1.1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 6;
    sun.shadow.camera.bottom = -1;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.25 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ─── Matériaux ──────────────────────────────────────────────────────────
    const YELLOW = new THREE.MeshStandardMaterial({
      color: 0xf6c51e,
      roughness: 0.45,
    });
    const DENIM = new THREE.MeshStandardMaterial({
      color: 0x3f6aa0,
      roughness: 0.85,
    });
    const DENIM2 = new THREE.MeshStandardMaterial({
      color: 0x35597f,
      roughness: 0.9,
    });
    const METAL = new THREE.MeshStandardMaterial({
      color: 0xc8c8cc,
      roughness: 0.25,
      metalness: 0.9,
    });
    const BLACK = new THREE.MeshStandardMaterial({
      color: 0x1c1c1e,
      roughness: 0.6,
    });
    const GLOVE = new THREE.MeshStandardMaterial({
      color: 0x2a2023,
      roughness: 0.7,
    });
    const WHITE = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
    });
    const IRIS = new THREE.MeshStandardMaterial({
      color: 0x8a4b1f,
      roughness: 0.3,
    });
    const STRAP = new THREE.MeshStandardMaterial({
      color: 0x2b2b2e,
      roughness: 0.8,
    });

    const minion = new THREE.Group();
    scene.add(minion);
    const S = (m: THREE.Mesh) => {
      m.castShadow = true;
      return m;
    };

    // ─── Corps ──────────────────────────────────────────────────────────────
    const R = 1;
    const BODY_LEN = 2.6;
    const body = S(
      new THREE.Mesh(new THREE.CapsuleGeometry(R, BODY_LEN, 24, 48), YELLOW),
    );
    body.position.y = R + BODY_LEN / 2 + 0.55;
    minion.add(body);
    const bodyTopY = body.position.y + BODY_LEN / 2;
    const bodyBotY = body.position.y - BODY_LEN / 2;

    // ─── Salopette ──────────────────────────────────────────────────────────
    const pantsH = 1.15;
    const pants = S(
      new THREE.Mesh(
        new THREE.CylinderGeometry(R + 0.06, R + 0.06, pantsH, 48),
        DENIM,
      ),
    );
    pants.position.y = bodyBotY - R * 0.15 + pantsH / 2 - 0.55;
    minion.add(pants);
    const pantsBottom = S(
      new THREE.Mesh(
        new THREE.SphereGeometry(
          R + 0.06,
          48,
          24,
          0,
          Math.PI * 2,
          Math.PI / 2,
          Math.PI / 2,
        ),
        DENIM,
      ),
    );
    pantsBottom.position.y = pants.position.y - pantsH / 2;
    pantsBottom.scale.y = 0.55;
    minion.add(pantsBottom);

    const bibH = 0.78;
    const bib = S(
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          R + 0.06,
          R + 0.06,
          bibH,
          48,
          1,
          true,
          -Math.PI / 4,
          Math.PI / 2,
        ),
        DENIM,
      ),
    );
    bib.position.y = pants.position.y + pantsH / 2 + bibH / 2 - 0.02;
    minion.add(bib);
    const back = S(
      new THREE.Mesh(
        new THREE.CylinderGeometry(
          R + 0.06,
          R + 0.06,
          bibH * 0.7,
          48,
          1,
          true,
          Math.PI - Math.PI / 4,
          Math.PI / 2,
        ),
        DENIM,
      ),
    );
    back.position.y = bib.position.y - bibH * 0.15;
    minion.add(back);

    const pocket = S(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.1), DENIM2));
    pocket.position.set(0, bib.position.y - 0.05, R + 0.03);
    minion.add(pocket);

    function strap(side: number) {
      const g = new THREE.Group();
      const st = S(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.95, 0.07), DENIM));
      st.position.y = 0.38;
      g.add(st);
      const btn = S(
        new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16), BLACK),
      );
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.02, 0.05);
      g.add(btn);
      g.position.set(side * 0.56, bib.position.y + bibH / 2 - 0.06, 0.76);
      g.rotation.x = -0.55;
      g.rotation.z = side * 0.3;
      return g;
    }
    minion.add(strap(1), strap(-1));

    // ─── Lunettes ───────────────────────────────────────────────────────────
    const eyeY = bodyTopY + 0.05;
    const strapBand = S(
      new THREE.Mesh(
        new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.22, 48, 1, true),
        STRAP,
      ),
    );
    strapBand.position.y = eyeY;
    minion.add(strapBand);

    function goggle(side: number) {
      const g = new THREE.Group();
      const rim = S(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 16, 32), METAL));
      g.add(rim);
      const eyeball = S(new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 24), WHITE));
      eyeball.position.z = -0.02;
      eyeball.scale.z = 0.55;
      g.add(eyeball);
      const iris = S(new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), IRIS));
      iris.position.z = 0.13;
      iris.scale.z = 0.4;
      g.add(iris);
      const pupil = S(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), BLACK));
      pupil.position.z = 0.18;
      pupil.scale.z = 0.5;
      g.add(pupil);
      const lid = S(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.33, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.38),
          YELLOW,
        ),
      );
      lid.position.z = -0.02;
      lid.scale.z = 0.6;
      lid.rotation.x = -0.25;
      g.add(lid);
      const a = side * 0.36;
      g.position.set(Math.sin(a) * R, eyeY, Math.cos(a) * R);
      g.rotation.y = a;
      return g;
    }
    minion.add(goggle(1), goggle(-1));

    // ─── Bouche ─────────────────────────────────────────────────────────────
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.03, 8, 24, Math.PI * 0.55),
      BLACK,
    );
    smile.position.set(0.1, eyeY - 0.78, R * 0.97);
    smile.rotation.z = Math.PI + 0.45;
    smile.rotation.x = -0.15;
    minion.add(smile);

    // ─── Cheveux (tiges noires → pics dorés) ───────────────────────────────
    const HAIR_BLACK = new THREE.Color(0x1c1c1e);
    const HAIR_GOLD = new THREE.Color(0xffd93b);
    const hairMat = new THREE.MeshStandardMaterial({
      color: HAIR_BLACK,
      roughness: 0.6,
      emissive: 0x000000,
    });
    const hairs: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const bend = (i - 2) * 0.12;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(bend * 0.6, 0.28, 0.02),
        new THREE.Vector3(bend, 0.5, 0.05),
      );
      const hair = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.012, 6), hairMat);
      hair.position.set((i - 2) * 0.07, bodyTopY + R - 0.03, 0);
      minion.add(hair);
      hairs.push(hair);
    }

    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xffd93b,
      roughness: 0.35,
      emissive: 0xcc9900,
      emissiveIntensity: 0.6,
    });
    const ssjHair = new THREE.Group();
    ssjHair.position.y = bodyTopY + R - 0.12;
    const SPIKES: [number, number, number, number, number][] = [
      [0, 0, 0.95, 0, 0],
      [0.22, 0.05, 0.75, 0, -0.45],
      [-0.22, 0.05, 0.75, 0, 0.45],
      [0.42, -0.05, 0.55, 0, -0.8],
      [-0.42, -0.05, 0.55, 0, 0.8],
      [0.12, -0.25, 0.7, 0.5, -0.25],
      [-0.12, -0.25, 0.7, 0.5, 0.25],
      [0.1, 0.24, 0.65, -0.45, -0.2],
      [-0.1, 0.24, 0.65, -0.45, 0.2],
    ];
    for (const [x, z, h, rx, rz] of SPIKES) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, h, 10), spikeMat);
      spike.position.set(x, h / 2 - 0.1, z);
      spike.rotation.x = rx;
      spike.rotation.z = rz;
      ssjHair.add(spike);
    }
    ssjHair.scale.setScalar(0.001);
    minion.add(ssjHair);

    // ─── Aura flamme (billboard + shader) ───────────────────────────────────
    const auraUniforms = {
      uTime: { value: 0 },
      uK: { value: 0 },
    };
    const auraMat = new THREE.ShaderMaterial({
      uniforms: auraUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uK;
        varying vec2 vUv;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 3; i++) {
            v += a * noise(p);
            p *= 2.1; a *= 0.5;
          }
          return v;
        }
        void main() {
          vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
          float n = fbm(vec2(p.x * 3.0, p.y * 4.0 - uTime * 2.2));
          float n2 = fbm(vec2(p.x * 6.0 + 10.0, p.y * 8.0 - uTime * 3.5));
          float width = mix(0.9, 0.28, smoothstep(0.05, 0.92, p.y));
          float edge = width + (n - 0.5) * 0.7 + (n2 - 0.5) * 0.25;
          float d = abs(p.x) / max(edge, 0.001);
          float flame = 1.0 - smoothstep(0.45, 1.0, d);
          flame *= smoothstep(0.0, 0.08, p.y) * (1.0 - smoothstep(0.88, 1.0, p.y));
          vec3 col = mix(vec3(1.0, 0.62, 0.03), vec3(1.0, 0.88, 0.25), flame);
          col = mix(col, vec3(1.0, 1.0, 0.75), pow(flame, 4.0));
          gl_FragColor = vec4(col, flame * 0.95 * uK);
        }
      `,
    });
    const aura = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 8.6), auraMat);
    aura.position.set(0, 3.4, 0);
    aura.renderOrder = 1;
    scene.add(aura);

    const auraLight = new THREE.PointLight(0xffdd44, 0, 12);
    auraLight.position.set(0, body.position.y + 1, 1.6);
    scene.add(auraLight);

    // ─── Bras / jambes (pivots pour la pose de charge) ──────────────────────
    function arm(side: number) {
      const g = new THREE.Group();
      const shoulder = new THREE.Vector3(side * (R - 0.08), bib.position.y + 0.75, 0);
      g.position.copy(shoulder);
      const elbow = new THREE.Vector3(
        side * (R + 0.75),
        bib.position.y + 0.1,
        0.1,
      ).sub(shoulder);
      const hip = new THREE.Vector3(
        side * (R - 0.15),
        pants.position.y + 0.45,
        0.25,
      ).sub(shoulder);

      function seg(a: THREE.Vector3, b: THREE.Vector3) {
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        const m = S(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, len, 8, 16), YELLOW));
        m.position.copy(a).addScaledVector(dir, 0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        return m;
      }
      g.add(seg(new THREE.Vector3(0, 0, 0), elbow), seg(elbow, hip));
      const hand = S(new THREE.Mesh(new THREE.SphereGeometry(0.23, 20, 16), GLOVE));
      hand.position.copy(hip);
      g.add(hand);
      return g;
    }
    const armR = arm(1),
      armL = arm(-1);
    minion.add(armR, armL);

    function leg(side: number) {
      const g = new THREE.Group();
      g.position.set(side * 0.4, 0.95, 0);
      const l = S(
        new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 20), DENIM),
      );
      l.position.set(0, -0.4, 0);
      g.add(l);
      const boot = S(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), BLACK));
      boot.position.set(0, -0.73, 0.08);
      boot.scale.set(1, 0.75, 1.35);
      g.add(boot);
      return g;
    }
    minion.add(leg(1), leg(-1));

    // ─── Animation : transformation automatique ─────────────────────────────
    const IRIS_BROWN = new THREE.Color(0x8a4b1f);
    const IRIS_TEAL = new THREE.Color(0x2fd6c8);
    const SSJ_START = 0.9; // secondes avant le déclenchement

    let k = 0;
    const clock = new THREE.Clock();
    const camDir = new THREE.Vector3();

    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      const target = t > SSJ_START ? 1 : 0;
      k += (target - k) * 0.045;
      const flick = 1 + (Math.sin(t * 17) + Math.sin(t * 23) * 0.6) * 0.06;

      hairMat.color.lerpColors(HAIR_BLACK, HAIR_GOLD, k);
      hairMat.emissive.setRGB(0.8 * k, 0.6 * k, 0);
      for (const h of hairs) h.scale.setScalar(Math.max(0.001, 1 - k));
      ssjHair.scale.setScalar(Math.max(0.001, k) * flick);

      IRIS.color.lerpColors(IRIS_BROWN, IRIS_TEAL, k);
      IRIS.emissive.setRGB(0, 0.5 * k, 0.45 * k);

      auraUniforms.uTime.value = t;
      auraUniforms.uK.value = k * flick;
      aura.quaternion.copy(camera.quaternion);
      camera.getWorldDirection(camDir);
      aura.position.set(0, 3.4, 0).addScaledVector(camDir, 1.4);
      const pulse = 1 + Math.sin(t * 9) * 0.03 * k;
      aura.scale.setScalar(pulse);
      auraLight.intensity = 12 * k * flick;

      (scene.background as THREE.Color).lerpColors(BG_LIGHT, BG_DARK, k);
      hemi.intensity = 1.1 - 0.55 * k;

      armR.rotation.z = 0.55 * k;
      armL.rotation.z = -0.55 * k;
      minion.position.y = Math.abs(Math.sin(t * 25)) * 0.02 * k;
      minion.position.x = Math.sin(t * 31) * 0.015 * k;
      minion.rotation.z = Math.sin(t * 29) * 0.008 * k;
      // Légère rotation de présentation
      minion.rotation.y = Math.sin(t * 0.7) * 0.25;

      renderer.render(scene, camera);
    });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    const doneTimer = setTimeout(() => onDoneRef.current(), duration);

    return () => {
      clearTimeout(doneTimer);
      window.removeEventListener("resize", onResize);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="julo-ssj-overlay" ref={mountRef} aria-live="assertive">
      <div className="julo-ssj-text">⚡ SUPER JULO ⚡</div>
    </div>
  );
}
