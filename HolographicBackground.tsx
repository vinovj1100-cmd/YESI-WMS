import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

class HelixGeometry extends THREE.BufferGeometry {
  parameters: { radius: number; height: number; turns: number; segments: number };

  constructor(radius: number, height: number, turns: number, segments: number) {
    super();
    (this as any).type = 'HelixGeometry';
    this.parameters = { radius, height, turns, segments };

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * turns;
      const x = Math.cos(angle) * radius;
      const y = (t - 0.5) * height;
      const z = Math.sin(angle) * radius;
      points.push(new THREE.Vector3(x, y, z));
    }
    this.setFromPoints(points);
  }
}

const vertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aType;
  attribute float aRandom;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec3 pos = position;
    float progress = fract(aRandom - uTime * 0.1);
    vec3 transformed = vec3(modelMatrix * vec4(pos, 1.0));
    vec4 mvPosition = vec4(transformed, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
    float size = (7.0 * uPixelRatio) * (1.0 + sin(aRandom * 10.0 + uTime));
    gl_PointSize = size;
    vAlpha = smoothstep(0.0, 0.1, progress) * (1.0 - smoothstep(0.9, 1.0, progress));
    float colorMix = sin(aRandom * 5.0 + uTime * 0.2) * 0.5 + 0.5;
    vColor = mix(vec3(1.0, 0.42, 0.21), vec3(0.9, 0.72, 0.0), colorMix);
  }
`;

const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;
  uniform float uScanLine;
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float strength = smoothstep(0.5, 0.0, dist);
    vec3 finalColor = vColor;
    float scanDiff = abs(gl_FragCoord.y - uScanLine);
    if (scanDiff < 50.0) {
      finalColor = mix(finalColor, uColor3, smoothstep(50.0, 0.0, scanDiff));
    }
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(finalColor, strength * vAlpha);
  }
`;

function DualHelixSystem() {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const { helixB, mergedPositions, count, randoms, floatTypes } = useMemo(() => {
    const helixA = new HelixGeometry(2, 2.5, 3, 300);
    const helixB = new HelixGeometry(2, 2.5, 3, 300);
    const positionsA = helixA.attributes.position.array as Float32Array;
    const positionsB = helixB.attributes.position.array as Float32Array;
    const reversedB = new Float32Array(positionsB.length);
    for (let i = 0; i < positionsB.length; i++) {
      reversedB[i] = positionsB[positionsB.length - 1 - i];
    }
    void helixA; // intentionally unused but constructed
    const mergedPositions = new Float32Array([...Array.from(positionsA), ...Array.from(reversedB)]);
    const particleCount = 200;
    const randoms = new Float32Array(particleCount);
    const floatTypes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      randoms[i] = Math.random();
      floatTypes[i] = Math.random();
    }
    return { helixB, mergedPositions, count: particleCount, randoms, floatTypes };
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Group rotation paused (wave stays still)
    if (groupRef.current) {
      groupRef.current.rotation.y = 0;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uScanLine.value = (Math.sin(time * 0.5) * 0.5 + 0.5) * 2.5;
    }
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uScanLine: { value: 0 },
    uColor1: { value: new THREE.Color('#ff6b35') },
    uColor2: { value: new THREE.Color('#1a1c1e') },
    uColor3: { value: new THREE.Color('#e63946') },
    uColor4: { value: new THREE.Color('#2ecc71') },
  }), []);

  return (
    <>
      <group position={[0, 0, -4]} rotation={[0.2, 0, 0]} ref={groupRef}>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[mergedPositions, 3]}
              count={mergedPositions.length / 3}
            />
            <bufferAttribute
              attach="attributes-aRandom"
              args={[randoms, 1]}
              count={count}
            />
            <bufferAttribute
              attach="attributes-aType"
              args={[floatTypes, 1]}
              count={count}
            />
            <bufferAttribute
              attach="attributes-aColor"
              args={[new Float32Array(count * 3), 3]}
              count={count}
            />
          </bufferGeometry>
          <shaderMaterial
            ref={materialRef}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            transparent
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={uniforms}
          />
        </points>
      </group>
      <group rotation={[0, Math.PI, 0]}>
        <points geometry={helixB} frustumCulled={false}>
          <pointsMaterial color="#222529" size={0.01} sizeAttenuation transparent opacity={0.3} />
        </points>
      </group>
    </>
  );
}

export default function HolographicBackground() {
  return (
    <div style={{ position: 'absolute', width: '100%', height: '100%', zIndex: -1 }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <DualHelixSystem />
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
