import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface HeartBodyProps {
  opacity?: number;
}

/**
 * Procedural cardiac placeholder mesh rendered when /models/heart.glb is not present.
 * Low-poly, semi-transparent to allow interior coronary trajectories to show clearly.
 */
function ProceduralHeart({ opacity = 0.65 }: HeartBodyProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Subtle rhythmic cardiac pulsation (65 bpm ~ 1.08 Hz)
  useFrame(({ clock }) => {
    if (groupRef.current) {
      const elapsed = clock.getElapsedTime();
      const pulse = 1 + Math.sin(elapsed * 2.2) * 0.018;
      groupRef.current.scale.set(pulse, pulse * 1.02, pulse);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Ventricular Core (tapered ellipsoid tilted towards apex) */}
      <mesh position={[-0.04, -0.05, 0.02]} rotation={[0.08, 0, -0.15]}>
        <sphereGeometry args={[1.02, 32, 32]} />
        <meshStandardMaterial
          color="#661125"
          roughness={0.5}
          metalness={0.1}
          transparent
          opacity={opacity}
          depthWrite={false}
        />
      </mesh>

      {/* Right Ventricle / Anterior Mass */}
      <mesh position={[0.22, 0.05, 0.15]} rotation={[-0.05, 0.1, 0.2]}>
        <sphereGeometry args={[0.78, 24, 24]} />
        <meshStandardMaterial
          color="#520e1e"
          roughness={0.55}
          metalness={0.08}
          transparent
          opacity={opacity * 0.9}
          depthWrite={false}
        />
      </mesh>

      {/* Left Atrial & Ventricular Posterior Bulge */}
      <mesh position={[-0.26, 0.2, -0.18]} rotation={[0.1, -0.2, 0]}>
        <sphereGeometry args={[0.72, 24, 24]} />
        <meshStandardMaterial
          color="#5a1022"
          roughness={0.6}
          metalness={0.08}
          transparent
          opacity={opacity * 0.85}
          depthWrite={false}
        />
      </mesh>

      {/* Aortic Root (Base) */}
      <mesh position={[0.06, 0.96, 0.22]} rotation={[0.15, 0, -0.08]}>
        <cylinderGeometry args={[0.26, 0.32, 0.55, 20]} />
        <meshStandardMaterial
          color="#7c1d32"
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={opacity * 0.92}
          depthWrite={false}
        />
      </mesh>

      {/* Pulmonary Trunk Base */}
      <mesh position={[-0.14, 0.88, 0.32]} rotation={[0.3, 0.2, -0.25]}>
        <cylinderGeometry args={[0.22, 0.26, 0.45, 18]} />
        <meshStandardMaterial
          color="#431422"
          roughness={0.45}
          metalness={0.12}
          transparent
          opacity={opacity * 0.85}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * GLTF Heart Model Loader.
 */
function GLTFHeart({ url, opacity = 0.65 }: { url: string; opacity?: number }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.opacity = opacity;
          mat.depthWrite = false;
        }
      }
    });
  }, [scene, opacity]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const elapsed = clock.getElapsedTime();
      const pulse = 1 + Math.sin(elapsed * 2.2) * 0.018;
      groupRef.current.scale.set(pulse, pulse * 1.02, pulse);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}

interface ErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class HeartErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function HeartBody({ opacity = 0.65 }: HeartBodyProps) {
  const [modelAvailable, setModelAvailable] = useState<boolean>(false);

  useEffect(() => {
    // Check if /models/heart.glb exists on the server without throwing
    // Note: Vite SPA router returns index.html (text/html) with status 200 for missing assets
    fetch('/models/heart.glb', { method: 'HEAD' })
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && !contentType.includes('text/html')) {
          setModelAvailable(true);
        } else {
          setModelAvailable(false);
        }
      })
      .catch(() => {
        setModelAvailable(false);
      });
  }, []);

  if (modelAvailable) {
    return (
      <HeartErrorBoundary fallback={<ProceduralHeart opacity={opacity} />}>
        <GLTFHeart url="/models/heart.glb" opacity={opacity} />
      </HeartErrorBoundary>
    );
  }

  // Fallback to procedural heart placeholder
  return <ProceduralHeart opacity={opacity} />;
}
