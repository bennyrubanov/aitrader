'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';
import { useRafGate } from '@/lib/use-raf-gate';
import { cn } from '@/lib/utils';

const vertexShader = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5 * uSpeed;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
  gl_FragColor = vec4(col, 1.0);
}
`;

export type IridescenceProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'color'> & {
  /** Shader tint as linear RGB (0–1 per channel). */
  color?: [number, number, number];
  speed?: number;
  amplitude?: number;
  mouseReact?: boolean;
};

/**
 * Full-viewport WebGL iridescence (React Bits / ogl). Uses WebGL1 so the classic fragment shader compiles.
 * @see https://reactbits.dev/backgrounds/iridescence
 */
export default function Iridescence({
  color = [1, 1, 1],
  speed = 1,
  amplitude = 0.1,
  mouseReact = false,
  className,
  ...rest
}: IridescenceProps) {
  const { ref: ctnDom, active } = useRafGate<HTMLDivElement>();
  const activeRef = useRef(active);
  activeRef.current = active;
  const kickRef = useRef<(() => void) | null>(null);
  const [enabled, setEnabled] = useState(false);
  const mousePos = useRef({ x: 0.5, y: 0.5 });
  const [c0, c1, c2] = color;

  useEffect(() => {
    if (active) setEnabled(true);
  }, [active]);

  useEffect(() => {
    if (!enabled) return;

    const ctn = ctnDom.current;
    if (!ctn) return;

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2);
    const renderer = new Renderer({
      dpr,
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      webgl: 1,
    });
    const { gl } = renderer;
    gl.clearColor(0, 0, 0, 1);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(c0, c1, c2) },
        uResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / Math.max(gl.canvas.height, 1)),
        },
        uMouse: { value: new Float32Array([mousePos.current.x, mousePos.current.y]) },
        uAmplitude: { value: amplitude },
        uSpeed: { value: speed },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    });

    function resize() {
      const w = ctn.offsetWidth;
      const h = ctn.offsetHeight;
      renderer.setSize(w, h);
      program.uniforms.uResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / Math.max(gl.canvas.height, 1),
      );
    }

    window.addEventListener('resize', resize, false);

    const mesh = new Mesh(gl, { geometry, program });
    let animateId = 0;
    let running = false;

    Object.assign(gl.canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
    });
    ctn.appendChild(gl.canvas);
    resize();

    function handleMouseMove(e: MouseEvent) {
      const rect = ctn.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1.0 - (e.clientY - rect.top) / Math.max(rect.height, 1);
      mousePos.current = { x, y };
      program.uniforms.uMouse.value[0] = x;
      program.uniforms.uMouse.value[1] = y;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      kickRef.current = null;
      renderer.render({ scene: mesh });
      return () => {
        window.removeEventListener('resize', resize);
        if (mouseReact) {
          ctn.removeEventListener('mousemove', handleMouseMove);
        }
        if (gl.canvas.parentNode === ctn) {
          ctn.removeChild(gl.canvas);
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    }

    function update(t: number) {
      if (!activeRef.current) {
        running = false;
        return;
      }
      animateId = requestAnimationFrame(update);
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    }

    const kick = () => {
      if (running) return;
      running = true;
      animateId = requestAnimationFrame(update);
    };
    kickRef.current = kick;
    if (activeRef.current) kick();

    if (mouseReact) {
      ctn.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      kickRef.current = null;
      cancelAnimationFrame(animateId);
      window.removeEventListener('resize', resize);
      if (mouseReact) {
        ctn.removeEventListener('mousemove', handleMouseMove);
      }
      if (gl.canvas.parentNode === ctn) {
        ctn.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [enabled, c0, c1, c2, speed, amplitude, mouseReact, ctnDom]);

  useEffect(() => {
    if (active && enabled) kickRef.current?.();
  }, [active, enabled]);

  return <div ref={ctnDom} className={cn('h-full w-full', className)} {...rest} />;
}
