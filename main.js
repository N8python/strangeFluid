import * as THREE from 'three';
import Stats from './stats.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
    alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const aspectRatio = window.innerWidth / window.innerHeight;
const frustumSize = window.innerHeight;
const camera = new THREE.OrthographicCamera(
    frustumSize * aspectRatio / -2, frustumSize * aspectRatio / 2,
    frustumSize / 2, frustumSize / -2,
    0.1, 1000
);
camera.position.z = 100;

const numSpheres = 6 * window.innerWidth;
const gravity = 500;
const restitution = 0.75;
const dragCoefficient = 0.1;
const coefficientOfKinematicFriction = 0.01;

const sphereFields = 4; // x, y, vx, vy
const X = 0;
const Y = 1;
const OLD_X = 2;
const OLD_Y = 3;
const spheres = new Float32Array(numSpheres * sphereFields);
const sphereRadius = 2.5;
const cellSize = 2 * sphereRadius;
const sumOfRadiiSquared = cellSize * cellSize;
const invCellSize = 1 / cellSize;
const maxParticlesPerCell = 8;
const gridWidth = Math.ceil(window.innerWidth / cellSize);
const gridHeight = Math.ceil(window.innerHeight / cellSize);
const grid = new Uint32Array(gridWidth * gridHeight * maxParticlesPerCell);
const nextInCell = new Uint8Array(gridWidth * gridHeight);

// Create instanced mesh
const geometry = new THREE.PlaneGeometry(2 * sphereRadius, 2 * sphereRadius);
const material = new THREE.ShaderMaterial({
    uniforms: {
        sphereRadius: { value: sphereRadius }
    },
    transparent: true,
    vertexShader: /*glsl*/ `
    varying vec2 vPosition;
    varying vec3 vColor;
        void main() {
            vPosition = position.xy;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
            vColor = instanceColor;
            //gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /*glsl*/ `
        uniform float sphereRadius;
        varying vec2 vPosition;
        varying vec3 vColor;
        void main() {
            vec2 pos = vPosition;
           float distFromCenter = distance(vec2(0.0), pos);
           //float visible = exp(-distFromCenter / sphereRadius);
           float visible = 1.0 - smoothstep(sphereRadius - 0.5, sphereRadius + 0.5, distFromCenter);

            
            gl_FragColor = vec4(vColor, visible);
        }
    `
});
const instancedMesh = new THREE.InstancedMesh(geometry, material, numSpheres);
// Set the colors randomly
for (let i = 0; i < numSpheres; i++) {
    //const color = ;
    //color.setHSL(Math.random(), 1, 0.5);
    instancedMesh.setColorAt(i, new THREE.Color(1, 1, 0.5));
}
scene.add(instancedMesh);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    stencilBuffer: false
}));

composer.addPass(new RenderPass(scene, camera));
const blurFactor = 0.5;
const hblur = new ShaderPass(HorizontalBlurShader);
const vblur = new ShaderPass(VerticalBlurShader);
hblur.uniforms.h.value = 4 / window.innerWidth * blurFactor;
vblur.uniforms.v.value = 4 / window.innerHeight * blurFactor;
const hblur2 = new ShaderPass(HorizontalBlurShader);
const vblur2 = new ShaderPass(VerticalBlurShader);
hblur2.uniforms.h.value = 1 / window.innerWidth * blurFactor;
vblur2.uniforms.v.value = 1 / window.innerHeight * blurFactor;
composer.addPass(hblur);
composer.addPass(vblur);
composer.addPass(hblur2);
composer.addPass(vblur2);
const finalPass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        time: { value: 0 }
    },
    vertexShader: /*glsl*/ `

        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /*glsl*/ `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform vec2 resolution;
        varying vec2 vUv;
        vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
        void main() {
            // Sample
            vec2 texelSize = 1.0 / resolution;
            vec4 color = texture2D(tDiffuse, vUv);
            //color.r += time * 0.1;
            /*if (color.a > 0.5) {
                gl_FragColor = color;
            } else {
                gl_FragColor = vec4(0.0);
            }*/
            gl_FragColor = vec4(mix(vec3(0.0), hsv2rgb(color.rgb), smoothstep(0.2 - 2.0 * fwidth(color.a), 0.2, color.a)), 1.0);
      
        }
    `
});
composer.addPass(finalPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.2;
bloomPass.strength = 2;
bloomPass.radius = 0.5;

composer.addPass(bloomPass);

const dummy = new THREE.Object3D();

function init() {
    for (let i = 0; i < numSpheres; i++) {
        const index = i * sphereFields;
        spheres[index + X] = 4 * sphereRadius + (4 * sphereRadius * i) % (window.innerWidth - 8 * sphereRadius) + sphereRadius * (Math.random() - 0.5);
        spheres[index + Y] = 100 + Math.floor((4 * sphereRadius * i) / (window.innerWidth - 8 * sphereRadius)) * 2 * sphereRadius + sphereRadius * (Math.random() - 0.5);
        spheres[index + OLD_X] = spheres[index + X];
        spheres[index + OLD_Y] = spheres[index + Y];

        dummy.position.set(
            spheres[index + X] - window.innerWidth / 2,
            window.innerHeight / 2 - spheres[index + Y],
            0
        );
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;

    // Initialize worker
    worker.postMessage({
        init: true,
        spheres,
        grid,
        nextInCell,
        numSpheres,
        sphereFields,
        X,
        Y,
        OLD_X,
        OLD_Y,
        gridWidth,
        gridHeight,
        maxParticlesPerCell,
        sphereRadius,
        cellSize,
        sumOfRadiiSquared,
        invCellSize,
        gravity,
        restitution
    });
    worker.postMessage({
        deltaTime: 0,
        mouseX: 0,
        mouseY: 0,
        mouseDown: false,
        width: window.innerWidth,
        height: window.innerHeight
    });
}

let time = performance.now();
const stats = new Stats();
document.body.appendChild(stats.dom);

let mouseX = 0,
    mouseY = 0,
    mouseDown = false;

document.addEventListener('mousemove', (e) => {
    if (mouseDown) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    }
});
document.addEventListener('mousedown', (e) => {
    mouseDown = true;
    mouseX = e.clientX;
    mouseY = e.clientY;
});

document.addEventListener('mouseup', () => {
    mouseDown = false;
});
let height = window.innerHeight;
let width = window.innerWidth;
const matrix = new THREE.Matrix4();
const instanceMeshMatrixArray = instancedMesh.instanceMatrix.array;

const worker = new Worker('worker.js');

let lastDeltaTime = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let lastMouseDown = false;
let lastPhysicsTime = performance.now();
let physicsHzArray = [];
const rollingAverageWindow = 60; // 1 second at 60 fps
let averageHz = 0;
const maxPhysicsHz = 60;
worker.onmessage = function(e) {
    messageEndTime = performance.now();
    const currentTime = performance.now();
    const timeSinceLastPhysics = currentTime - lastPhysicsTime;
    const instantHz = 1000 / timeSinceLastPhysics;

    physicsHzArray.push(instantHz);
    if (physicsHzArray.length > rollingAverageWindow) {
        physicsHzArray.shift();
    }

    averageHz = physicsHzArray.reduce((sum, hz) => sum + hz, 0) / physicsHzArray.length;

    lastPhysicsTime = currentTime;
    const updatedSpheres = e.data;
    for (let i = 0; i < numSpheres; i++) {
        const index = i * sphereFields;
        const xCoord = i * 16 + 12;
        instanceMeshMatrixArray[xCoord] = updatedSpheres[index + X] - width / 2;
        instanceMeshMatrixArray[xCoord + 1] = height / 2 - updatedSpheres[index + Y];
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    physicsDone = true;
    document.getElementById('physicsTime').innerText = `Physics Time: ${(messageEndTime - messageStartTime).toFixed(2)}ms`;
};

function animate() {
    stats.update();
    lastDeltaTime = (performance.now() - time) / 1000;
    time = performance.now();
    lastDeltaTime = Math.min(lastDeltaTime, 0.016);

    lastMouseX = mouseX;
    lastMouseY = mouseY;
    lastMouseDown = mouseDown;
    finalPass.uniforms.time.value = performance.now() / 1000;
    composer.render();
    requestAnimationFrame(animate);
    document.getElementById('pCount').innerText = `Particle Count: ${numSpheres}`;
    document.getElementById('physicsHz').innerText = `Physics Hz: ${averageHz.toFixed(2)}`;
}
let physicsTime = performance.now();
let physicsDone = true;
let messageStartTime = null; //performance.now();
let messageEndTime = null;

function physics() {
    if (!physicsDone || performance.now() - physicsTime < (1000 / maxPhysicsHz) - 2) {
        return;
    }
    const delta = Math.min((performance.now() - physicsTime) / 1000, 1 / maxPhysicsHz);
    physicsDone = false;
    messageStartTime = performance.now();
    worker.postMessage({
        deltaTime: delta,
        mouseX: lastMouseX,
        mouseY: lastMouseY,
        mouseDown: lastMouseDown,
        width,
        height
    });
    physicsTime = performance.now();
}
init();
animate();
setInterval(physics, 1);
/*window.addEventListener('resize', () => {
    height = window.innerHeight;
    width = window.innerWidth;
    const newAspectRatio = window.innerWidth / window.innerHeight;
    const newFrustumSize = window.innerHeight;

    camera.left = -newFrustumSize * newAspectRatio / 2;
    camera.right = newFrustumSize * newAspectRatio / 2;
    camera.top = newFrustumSize / 2;
    camera.bottom = -newFrustumSize / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});*/