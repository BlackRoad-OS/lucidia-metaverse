import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as CANNON from 'cannon-es';

// ===========================
// LUCIDIA METAVERSE ENGINE
// ===========================

class LucidiaMetaverse {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.clock = new THREE.Clock();

        // Physics world
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.81, 0);

        // Player
        this.player = {
            velocity: new THREE.Vector3(),
            canJump: false,
            height: 1.8,
            speed: 10,
            jumpPower: 7
        };

        // Controls
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canRun = false;

        // Other players
        this.otherPlayers = new Map();

        // FPS counter
        this.frameCount = 0;
        this.lastTime = performance.now();

        // Animated scene objects
        this.clouds = [];
        this.water = null;

        this.init();
    }

    init() {
        // Renderer setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        // Atmospheric fog
        this.scene.fog = new THREE.Fog(0xb0d8f0, 150, 700);

        // Camera position
        this.camera.position.set(0, this.player.height, 10);

        // Create environment
        this.createSky();
        this.createLighting();
        this.createGround();
        this.createMountains();
        this.createWater();
        this.createTrees();
        this.createClouds();
        this.createParticleEffects();

        // Physics for player
        const playerShape = new CANNON.Sphere(0.5);
        this.playerBody = new CANNON.Body({
            mass: 70,
            shape: playerShape,
            linearDamping: 0.9
        });
        this.playerBody.position.set(0, this.player.height, 10);
        this.world.addBody(this.playerBody);

        // Controls
        this.controls = new PointerLockControls(this.camera, document.body);

        // Event listeners
        this.setupEventListeners();

        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('controls').style.display = 'block';
            document.getElementById('chat').style.display = 'block';
            document.getElementById('chat-input').style.display = 'block';
            this.addChatMessage('System', 'Welcome to Lucidia Metaverse');
        }, 2000);

        // Start animation loop
        this.animate();
    }

    createSky() {
        // Realistic daytime blue sky gradient
        const skyGeo = new THREE.SphereGeometry(800, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x1a6ab8) },
                bottomColor: { value: new THREE.Color(0xb8daf5) },
                offset: { value: 10 },
                exponent: { value: 0.4 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });

        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);
    }

    createLighting() {
        // Natural ambient sky light
        const ambient = new THREE.AmbientLight(0xd6e8f0, 0.6);
        this.scene.add(ambient);

        // Sun (warm natural directional light)
        const sun = new THREE.DirectionalLight(0xfffbe8, 1.8);
        sun.position.set(200, 300, 100);
        sun.castShadow = true;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);

        // Subtle sky-bounce fill light from opposite side
        const fill = new THREE.DirectionalLight(0x88aacc, 0.3);
        fill.position.set(-100, 50, -100);
        this.scene.add(fill);
    }

    createGround() {
        // Grass terrain with gentle height variation
        const groundGeo = new THREE.PlaneGeometry(600, 600, 150, 150);

        // Sculpt hills, keep spawn area flat
        const vertices = groundGeo.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const distFromCenter = Math.sqrt(x * x + y * y);
            const flattenFactor = Math.min(1.0, distFromCenter / 30);
            vertices[i + 2] =
                flattenFactor * (
                    Math.sin(x * 0.05) * 3 +
                    Math.cos(y * 0.04) * 2 +
                    Math.sin(x * 0.02 + y * 0.03) * 5 +
                    Math.sin(x * 0.1) * 1.2
                );
        }
        groundGeo.computeVertexNormals();

        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x3a7d44,
            roughness: 0.9,
            metalness: 0.0
        });

        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Physics ground
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);
    }

    createMountains() {
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * Math.PI * 2 + Math.random() * 0.3;
            const distance = 200 + Math.random() * 100;
            const height = Math.random() * 60 + 30;
            const radius = height * (0.5 + Math.random() * 0.3);

            const mtnGeo = new THREE.ConeGeometry(radius, height, 7 + Math.floor(Math.random() * 4));
            const mtnMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.05 + Math.random() * 0.05, 0.15, 0.3 + Math.random() * 0.2),
                roughness: 0.95
            });

            const mountain = new THREE.Mesh(mtnGeo, mtnMat);
            mountain.position.set(
                Math.cos(angle) * distance,
                height / 2 - 5,
                Math.sin(angle) * distance
            );
            mountain.castShadow = true;
            this.scene.add(mountain);

            // Snow cap on tall peaks
            if (height > 60) {
                const snowGeo = new THREE.ConeGeometry(radius * 0.25, height * 0.2, 7);
                const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
                const snow = new THREE.Mesh(snowGeo, snowMat);
                snow.position.set(
                    mountain.position.x,
                    mountain.position.y + height * 0.4,
                    mountain.position.z
                );
                this.scene.add(snow);
            }
        }
    }

    createWater() {
        const waterGeo = new THREE.PlaneGeometry(600, 600);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x006994,
            transparent: true,
            opacity: 0.75,
            roughness: 0.05,
            metalness: 0.1
        });
        this.water = new THREE.Mesh(waterGeo, waterMat);
        this.water.rotation.x = -Math.PI / 2;
        this.water.position.y = -2.5;
        this.scene.add(this.water);
    }

    createTrees() {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f0a, roughness: 0.95 });
        const foliageMats = [
            new THREE.MeshStandardMaterial({ color: 0x2d6b22, roughness: 0.8 }),
            new THREE.MeshStandardMaterial({ color: 0x3d8a2f, roughness: 0.8 }),
            new THREE.MeshStandardMaterial({ color: 0x1f5218, roughness: 0.8 })
        ];

        for (let i = 0; i < 300; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 200 + 15;
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const trunkHeight = Math.random() * 4 + 3;

            const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, trunkHeight, 6);
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.set(x, trunkHeight / 2, z);
            trunk.castShadow = true;
            this.scene.add(trunk);

            // Three layered foliage cones
            for (let j = 0; j < 3; j++) {
                const layerRadius = 2.5 - j * 0.5 + Math.random() * 0.5;
                const foliageGeo = new THREE.ConeGeometry(layerRadius, 2.5, 7);
                const foliage = new THREE.Mesh(foliageGeo, foliageMats[j % foliageMats.length]);
                foliage.position.set(x, trunkHeight + j * 1.2 + 0.5, z);
                foliage.castShadow = true;
                this.scene.add(foliage);
            }
        }
    }

    createClouds() {
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.88,
            roughness: 1
        });

        for (let i = 0; i < 25; i++) {
            const cloudGroup = new THREE.Group();
            const puffs = Math.floor(Math.random() * 5) + 4;

            for (let j = 0; j < puffs; j++) {
                const puffGeo = new THREE.SphereGeometry(Math.random() * 8 + 5, 7, 5);
                const puff = new THREE.Mesh(puffGeo, cloudMat);
                puff.position.set(
                    (Math.random() - 0.5) * 25,
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 12
                );
                cloudGroup.add(puff);
            }

            cloudGroup.position.set(
                (Math.random() - 0.5) * 500,
                Math.random() * 60 + 80,
                (Math.random() - 0.5) * 500
            );
            this.scene.add(cloudGroup);
            this.clouds.push(cloudGroup);
        }
    }

    createParticleEffects() {
        // Natural floating dust / pollen particles
        const particleCount = 500;
        const particlesGeometry = new THREE.BufferGeometry();
        const particlePositions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount * 3; i += 3) {
            particlePositions[i] = (Math.random() - 0.5) * 60;
            particlePositions[i + 1] = Math.random() * 20 + 1;
            particlePositions[i + 2] = (Math.random() - 0.5) * 60;
        }

        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

        const particlesMaterial = new THREE.PointsMaterial({
            color: 0xfffacd,
            size: 0.08,
            transparent: true,
            opacity: 0.5
        });

        this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
        this.scene.add(this.particles);
    }

    setupEventListeners() {
        // Click to enable pointer lock
        document.body.addEventListener('click', () => {
            if (!this.controls.isLocked) {
                this.controls.lock();
            }
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            switch (e.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'ShiftLeft': this.canRun = true; break;
                case 'Space':
                    if (this.player.canJump) {
                        this.playerBody.velocity.y = this.player.jumpPower;
                        this.player.canJump = false;
                    }
                    break;
                case 'KeyT':
                    e.preventDefault();
                    document.getElementById('chat-input').focus();
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'ShiftLeft': this.canRun = false; break;
            }
        });

        // Chat input
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.code === 'Enter') {
                const msg = e.target.value.trim();
                if (msg) {
                    this.addChatMessage('You', msg);
                    e.target.value = '';
                }
                e.target.blur();
                this.controls.lock();
            } else if (e.code === 'Escape') {
                e.target.blur();
                this.controls.lock();
            }
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // VR button (if supported)
        if ('xr' in navigator) {
            navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                if (supported) {
                    document.getElementById('vr-button').style.display = 'block';
                    document.getElementById('vr-button').addEventListener('click', () => {
                        this.enterVR();
                    });
                }
            });
        }
    }

    addChatMessage(sender, message) {
        const chatDiv = document.getElementById('chat');
        const msgEl = document.createElement('div');
        msgEl.style.marginBottom = '5px';
        msgEl.innerHTML = `<strong>${sender}:</strong> ${message}`;
        chatDiv.appendChild(msgEl);
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }

    updateMovement(delta) {
        const speed = this.canRun ? this.player.speed * 2 : this.player.speed;
        const velocity = new CANNON.Vec3(0, this.playerBody.velocity.y, 0);

        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();

        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

        if (this.moveForward) velocity.z -= forward.z * speed;
        if (this.moveBackward) velocity.z += forward.z * speed;
        if (this.moveLeft) velocity.x -= right.x * speed;
        if (this.moveRight) velocity.x += right.x * speed;

        if (this.moveForward) velocity.x -= forward.x * speed;
        if (this.moveBackward) velocity.x += forward.x * speed;
        if (this.moveLeft) velocity.z -= right.z * speed;
        if (this.moveRight) velocity.z += right.z * speed;

        this.playerBody.velocity.x = velocity.x;
        this.playerBody.velocity.z = velocity.z;

        // Check if on ground
        if (Math.abs(this.playerBody.velocity.y) < 0.1 && this.playerBody.position.y < this.player.height + 0.1) {
            this.player.canJump = true;
        }

        // Update camera position
        this.camera.position.x = this.playerBody.position.x;
        this.camera.position.y = this.playerBody.position.y + this.player.height / 2;
        this.camera.position.z = this.playerBody.position.z;

        // Update HUD
        document.getElementById('position').textContent =
            `${this.camera.position.x.toFixed(1)}, ${this.camera.position.y.toFixed(1)}, ${this.camera.position.z.toFixed(1)}`;
    }

    updateFPS() {
        this.frameCount++;
        const currentTime = performance.now();

        if (currentTime >= this.lastTime + 1000) {
            document.getElementById('fps').textContent = this.frameCount;
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
    }

    enterVR() {
        this.renderer.xr.enabled = true;
        navigator.xr.requestSession('immersive-vr').then((session) => {
            this.renderer.xr.setSession(session);
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Update physics
        this.world.step(1 / 60, delta, 3);

        // Update movement
        if (this.controls.isLocked) {
            this.updateMovement(delta);
        }

        // Drift clouds slowly
        this.clouds.forEach(cloud => {
            cloud.position.x += 0.02;
            if (cloud.position.x > 250) cloud.position.x = -250;
        });

        // Gently bob water surface
        if (this.water) {
            this.water.position.y = -2.5 + Math.sin(this.clock.elapsedTime * 0.4) * 0.1;
        }

        // Animate pollen particles
        if (this.particles) {
            this.particles.rotation.y += 0.0002;
        }

        // Update FPS counter
        this.updateFPS();

        // Render
        this.renderer.render(this.scene, this.camera);
    }
}

// Initialize the metaverse when page loads
window.addEventListener('load', () => {
    new LucidiaMetaverse();
});
