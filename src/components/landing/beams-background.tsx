'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRafGate } from '@/lib/use-raf-gate';

type BeamsBackgroundProps = {
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  lightColor?: string;
  /**
   * Hex color used as the PBR diffuse on the ribbon material. Black gives the
   * "lit highlight only" look that works on dark backgrounds. A pale color
   * gives visible ribbons on light backgrounds.
   */
  diffuseColor?: string;
  /** White ambient light intensity (fills unlit valleys). */
  ambientIntensity?: number;
  /** Brand-tinted directional light intensity (drives the highlights). */
  directionalIntensity?: number;
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  rotation?: number;
  /** Camera Z — lower = zoom in (ribbons fill more of the view, edges less obvious). */
  cameraDistance?: number;
  /** Perspective FOV (deg) — lower = tighter zoom on the beam stack. */
  cameraFov?: number;
  className?: string;
};

/**
 * Vanilla-three port of the React Bits <Beams /> component.
 *
 * Avoids the @react-three/fiber + @react-three/drei dependencies. The visual
 * recipe is the same as the upstream demo:
 *   - Stack of black `MeshStandardMaterial` planes (PBR, lit).
 *   - `onBeforeCompile` injects a perlin displacement on z and recomputes the
 *     surface normal from neighbours so the lighting actually carves 3D-looking
 *     ribbons.
 *   - One ambient white light + one directional light tinted by `lightColor`.
 *     The colored "beam" effect is the directional light reflecting off the
 *     curved black ribbons; we are NOT alpha-blending colored sprites.
 *   - Fragment subtracts a small dithered noise term, exactly as in the demo.
 *
 * Reference: https://reactbits.dev/backgrounds/beams
 */

const NOISE_GLSL = /* glsl */ `
float beams_random(in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
float beams_noise2(in vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = beams_random(i);
  float b = beams_random(i + vec2(1.0, 0.0));
  float c = beams_random(i + vec2(0.0, 1.0));
  float d = beams_random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
vec4 beams_permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 beams_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 beams_fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float beams_cnoise(vec3 P) {
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;
  vec4 ixy = beams_permute(beams_permute(ix) + iy);
  vec4 ixy0 = beams_permute(ixy + iz0);
  vec4 ixy1 = beams_permute(ixy + iz1);
  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
  vec4 norm0 = beams_taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = beams_taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);
  vec3 fade_xyz = beams_fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}
`;

const VERTEX_HELPERS = /* glsl */ `
float beams_getPos(vec3 pos) {
  vec3 noisePos = vec3(pos.x * 0.0, pos.y - uv.y, pos.z + time * uSpeed * 3.0) * uScale;
  return beams_cnoise(noisePos);
}
vec3 beams_getCurrentPos(vec3 pos) {
  vec3 newpos = pos;
  newpos.z += beams_getPos(pos);
  return newpos;
}
vec3 beams_getNormal(vec3 pos) {
  vec3 curpos = beams_getCurrentPos(pos);
  vec3 nextposX = beams_getCurrentPos(pos + vec3(0.01, 0.0, 0.0));
  vec3 nextposZ = beams_getCurrentPos(pos + vec3(0.0, -0.01, 0.0));
  vec3 tangentX = normalize(nextposX - curpos);
  vec3 tangentZ = normalize(nextposZ - curpos);
  return normalize(cross(tangentZ, tangentX));
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return [1, 1, 1];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function createStackedPlanesGeometry(
  THREE: typeof import('three'),
  count: number,
  width: number,
  height: number,
  spacing: number,
  heightSegments: number
) {
  const geometry = new THREE.BufferGeometry();
  const numVertices = count * (heightSegments + 1) * 2;
  const numFaces = count * heightSegments * 2;
  const positions = new Float32Array(numVertices * 3);
  const indices = new Uint32Array(numFaces * 3);
  const uvs = new Float32Array(numVertices * 2);

  let vertexOffset = 0;
  let indexOffset = 0;
  let uvOffset = 0;
  const totalWidth = count * width + (count - 1) * spacing;
  const xOffsetBase = -totalWidth / 2;

  for (let i = 0; i < count; i += 1) {
    const xOffset = xOffsetBase + i * (width + spacing);
    const uvXOffset = Math.random() * 300;
    const uvYOffset = Math.random() * 300;

    for (let j = 0; j <= heightSegments; j += 1) {
      const y = height * (j / heightSegments - 0.5);
      positions.set([xOffset, y, 0, xOffset + width, y, 0], vertexOffset * 3);
      const uvY = j / heightSegments;
      uvs.set([uvXOffset, uvY + uvYOffset, uvXOffset + 1, uvY + uvYOffset], uvOffset);

      if (j < heightSegments) {
        const a = vertexOffset;
        const b = vertexOffset + 1;
        const c = vertexOffset + 2;
        const d = vertexOffset + 3;
        indices.set([a, b, c, c, b, d], indexOffset);
        indexOffset += 6;
      }
      vertexOffset += 2;
      uvOffset += 4;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export default function BeamsBackground({
  beamWidth = 2,
  beamHeight = 15,
  beamNumber = 12,
  lightColor = '#ffffff',
  diffuseColor = '#000000',
  ambientIntensity = 0.55,
  directionalIntensity = 0.8,
  speed = 2,
  noiseIntensity = 1.75,
  scale = 0.2,
  rotation = 0,
  cameraDistance = 20,
  cameraFov = 30,
  className,
}: BeamsBackgroundProps) {
  const { ref: containerRef, active } = useRafGate<HTMLDivElement>();
  const activeRef = useRef(active);
  activeRef.current = active;
  const kickRef = useRef<(() => void) | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (active) setEnabled(true);
  }, [active]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let cleanup: (() => void) | undefined;

    void import('three').then((THREE) => {
      if (disposed || !container.isConnected) return;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.className = 'h-full w-full';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.1, 100);
      camera.position.set(0, 0, cameraDistance);

      scene.add(new THREE.AmbientLight(0xffffff, ambientIntensity));

      const group = new THREE.Group();
      group.rotation.z = THREE.MathUtils.degToRad(rotation);
      scene.add(group);

      const dirLight = new THREE.DirectionalLight(
        new THREE.Color(...hexToRgb(lightColor)),
        directionalIntensity
      );
      dirLight.position.set(0, 3, 10);
      group.add(dirLight);

      const customUniforms = {
        time: { value: 0 },
        uSpeed: { value: speed },
        uNoiseIntensity: { value: noiseIntensity },
        uScale: { value: scale },
      };

      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(...hexToRgb(diffuseColor)),
        roughness: 0.3,
        metalness: 0.3,
        envMapIntensity: 10,
      });

      material.onBeforeCompile = (shader) => {
        shader.uniforms.time = customUniforms.time;
        shader.uniforms.uSpeed = customUniforms.uSpeed;
        shader.uniforms.uNoiseIntensity = customUniforms.uNoiseIntensity;
        shader.uniforms.uScale = customUniforms.uScale;

        const header = `
          uniform float time;
          uniform float uSpeed;
          uniform float uNoiseIntensity;
          uniform float uScale;
          ${NOISE_GLSL}
        `;

        shader.vertexShader = `${header}\n${VERTEX_HELPERS}\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += beams_getPos(transformed.xyz);`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          objectNormal = beams_getNormal(position.xyz);`
        );

        shader.fragmentShader = `${header}\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          float beamsRandomNoise = beams_noise2(gl_FragCoord.xy);
          gl_FragColor.rgb -= beamsRandomNoise / 15.0 * uNoiseIntensity;`
        );
      };

      const geometry = createStackedPlanesGeometry(THREE, beamNumber, beamWidth, beamHeight, 0, 60);
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      const clock = new THREE.Clock();
      const resize = () => {
        const { width, height } = container.getBoundingClientRect();
        renderer.setSize(Math.max(1, width), Math.max(1, height), false);
        camera.aspect = Math.max(1, width) / Math.max(1, height);
        camera.updateProjectionMatrix();
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        kickRef.current = null;
        renderer.render(scene, camera);
        cleanup = () => {
          kickRef.current = null;
          window.cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          group.remove(mesh);
          group.remove(dirLight);
          scene.remove(group);
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
        return;
      }

      let running = false;
      const animate = () => {
        if (!activeRef.current) {
          running = false;
          return;
        }
        customUniforms.time.value += clock.getDelta() * 0.1;
        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(animate);
      };
      const kick = () => {
        if (running) return;
        running = true;
        frameId = window.requestAnimationFrame(animate);
      };
      kickRef.current = kick;
      if (activeRef.current) kick();

      cleanup = () => {
        kickRef.current = null;
        window.cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        group.remove(mesh);
        group.remove(dirLight);
        scene.remove(group);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [
    ambientIntensity,
    beamHeight,
    beamNumber,
    beamWidth,
    cameraDistance,
    cameraFov,
    diffuseColor,
    directionalIntensity,
    lightColor,
    noiseIntensity,
    rotation,
    scale,
    speed,
    enabled,
    containerRef,
  ]);

  useEffect(() => {
    if (active && enabled) kickRef.current?.();
  }, [active, enabled]);

  return <div ref={containerRef} className={cn('relative h-full w-full', className)} />;
}
