'use client';
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

function AnimatedOrb({
  position,
  color,
  scale = 1,
  speed = 1,
  distort = 0.4,
}: {
  position: [number, number, number];
  color: string;
  scale?: number;
  speed?: number;
  distort?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.2 * speed;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3 * speed;
    }
  });

  return (
    <Float speed={speed * 0.8} rotationIntensity={0.5} floatIntensity={1.5}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <sphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial
          color={color}
          distort={distort}
          speed={speed * 2}
          roughness={0.1}
          metalness={0.8}
          transparent
          opacity={0.7}
        />
      </mesh>
    </Float>
  );
}

function AnimatedTorus({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.5;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <Float speed={1} rotationIntensity={1} floatIntensity={1}>
      <mesh ref={meshRef} position={position}>
        <torusGeometry args={[1.5, 0.2, 12, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.3}
          wireframe
        />
      </mesh>
    </Float>
  );
}

function ParticleField() {
  const count = 200;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    return arr;
  }, []);

  const meshRef = useRef<THREE.Points>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#a3e635" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

export function HeroScene() {
  const [isInView, setIsInView] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.2]}
        frameloop={isInView ? 'always' : 'never'}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={1} color="#a3e635" />
        <pointLight position={[-5, -5, 5]} intensity={0.8} color="#22d3ee" />
        <pointLight position={[0, 0, 10]} intensity={0.5} color="#a855f7" />

        <Stars radius={50} depth={50} count={1000} factor={4} saturation={0} fade />
        <ParticleField />

        <AnimatedOrb position={[-4, 1, -2]} color="#a3e635" scale={1.2} speed={0.7} distort={0.5} />
        <AnimatedOrb position={[4, -1, -1]} color="#22d3ee" scale={0.9} speed={1.1} distort={0.3} />
        <AnimatedOrb position={[0, 3, -4]} color="#a855f7" scale={0.7} speed={0.9} distort={0.6} />
        <AnimatedTorus position={[-3, -2, -3]} color="#a3e635" />
        <AnimatedTorus position={[3, 2, -2]} color="#22d3ee" />
      </Canvas>
    </div>
  );
}
