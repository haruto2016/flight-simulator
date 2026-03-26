// sky.js - Sky, atmosphere, clouds, and lighting manager

class SkyManager {
    constructor(scene) {
        this.scene = scene;
        this.sunLight = null;
        this.ambientLight = null;
        this.hemisphere = null;
        this.clouds = [];
        this.timeOfDay = 'noon';
        this.weather = 'clear';
    }

    init(timeOfDay, weather) {
        this.timeOfDay = timeOfDay;
        this.weather = weather;
        this._createLighting();
        this._createSkyDome();
        this._createClouds();
        this._createFog();
    }

    _getTimeConfig() {
        const configs = {
            morning: {
                sunPos: new THREE.Vector3(500, 100, 300),
                sunColor: 0xffd4a0,
                sunIntensity: 0.8,
                ambientColor: 0x8899bb,
                ambientIntensity: 0.35,
                skyTop: 0x4a6fa5,
                skyBottom: 0xf5c67a,
                horizonColor: 0xf0a050,
                fogColor: 0xc4a882,
                fogNear: 800,
                fogFar: 8000,
            },
            noon: {
                sunPos: new THREE.Vector3(200, 800, 200),
                sunColor: 0xffffff,
                sunIntensity: 1.2,
                ambientColor: 0x87ceeb,
                ambientIntensity: 0.5,
                skyTop: 0x1a5cb5,
                skyBottom: 0x87ceeb,
                horizonColor: 0xaad4f5,
                fogColor: 0x87ceeb,
                fogNear: 1500,
                fogFar: 12000,
            },
            evening: {
                sunPos: new THREE.Vector3(-400, 60, 200),
                sunColor: 0xff6030,
                sunIntensity: 0.7,
                ambientColor: 0x553344,
                ambientIntensity: 0.25,
                skyTop: 0x1a0a2e,
                skyBottom: 0xff5533,
                horizonColor: 0xff4422,
                fogColor: 0x664433,
                fogNear: 600,
                fogFar: 6000,
            },
            night: {
                sunPos: new THREE.Vector3(0, -200, 0),
                sunColor: 0x223355,
                sunIntensity: 0.1,
                ambientColor: 0x112244,
                ambientIntensity: 0.15,
                skyTop: 0x000511,
                skyBottom: 0x0a1025,
                horizonColor: 0x0a1530,
                fogColor: 0x050a15,
                fogNear: 400,
                fogFar: 5000,
            }
        };
        return configs[this.timeOfDay] || configs.noon;
    }

    _createLighting() {
        const cfg = this._getTimeConfig();

        // Directional sun light
        this.sunLight = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
        this.sunLight.position.copy(cfg.sunPos);
        this.sunLight.castShadow = false;
        this.scene.add(this.sunLight);

        // Hemisphere light for sky/ground ambient
        this.hemisphere = new THREE.HemisphereLight(cfg.skyTop, 0x3a5a2a, 0.4);
        this.scene.add(this.hemisphere);

        // Ambient
        this.ambientLight = new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
        this.scene.add(this.ambientLight);
    }

    _createSkyDome() {
        const cfg = this._getTimeConfig();

        // Large sky sphere
        const skyGeo = new THREE.SphereGeometry(15000, 32, 32);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(cfg.skyTop) },
                bottomColor: { value: new THREE.Color(cfg.skyBottom) },
                horizonColor: { value: new THREE.Color(cfg.horizonColor) },
                offset: { value: 20 },
                exponent: { value: 0.5 }
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
                uniform vec3 horizonColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    float t = max(pow(max(h, 0.0), exponent), 0.0);
                    vec3 color;
                    if (h < 0.15) {
                        color = mix(bottomColor, horizonColor, h / 0.15);
                    } else {
                        color = mix(horizonColor, topColor, (h - 0.15) / 0.85);
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyDome);

        // Stars for night
        if (this.timeOfDay === 'night' || this.timeOfDay === 'evening') {
            this._createStars();
        }
    }

    _createStars() {
        const starGeo = new THREE.BufferGeometry();
        const starCount = 3000;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 0.8 + 0.2); // upper hemisphere
            const r = 14000;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: this.timeOfDay === 'night' ? 3 : 1.5,
            transparent: true,
            opacity: this.timeOfDay === 'night' ? 0.9 : 0.3,
            sizeAttenuation: false
        });
        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    _createClouds() {
        const cloudCount = this.weather === 'cloudy' ? 120 : this.weather === 'foggy' ? 40 : 60;
        const cloudGroup = new THREE.Group();

        for (let i = 0; i < cloudCount; i++) {
            const cloud = this._makeCloud();
            const x = (Math.random() - 0.5) * 16000;
            const y = 300 + Math.random() * 2500;
            const z = (Math.random() - 0.5) * 16000;
            cloud.position.set(x, y, z);
            cloud.userData.baseY = y;
            cloud.userData.driftSpeed = 0.5 + Math.random() * 1.5;
            cloud.userData.bobSpeed = 0.3 + Math.random() * 0.5;
            cloud.userData.bobOffset = Math.random() * Math.PI * 2;
            cloudGroup.add(cloud);
            this.clouds.push(cloud);
        }
        this.cloudGroup = cloudGroup;
        this.scene.add(cloudGroup);
    }

    _makeCloud() {
        const group = new THREE.Group();
        const puffCount = 4 + Math.floor(Math.random() * 5);
        const opacity = this.weather === 'foggy' ? 0.4 : 0.7;

        for (let i = 0; i < puffCount; i++) {
            const size = 80 + Math.random() * 200;
            const geo = new THREE.SphereGeometry(size, 8, 6);
            const mat = new THREE.MeshLambertMaterial({
                color: this.timeOfDay === 'evening' ? 0xffaa88 :
                       this.timeOfDay === 'night' ? 0x223355 : 0xffffff,
                transparent: true,
                opacity: opacity * (0.6 + Math.random() * 0.4),
                depthWrite: false,
            });
            const puff = new THREE.Mesh(geo, mat);
            puff.position.set(
                (Math.random() - 0.5) * 300,
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 200
            );
            puff.scale.y = 0.4 + Math.random() * 0.3;
            group.add(puff);
        }
        return group;
    }

    _createFog() {
        const cfg = this._getTimeConfig();
        let near = cfg.fogNear;
        let far = cfg.fogFar;

        if (this.weather === 'foggy') {
            near = 50;
            far = 2000;
        } else if (this.weather === 'cloudy') {
            near *= 0.6;
            far *= 0.7;
        }
        this.scene.fog = new THREE.Fog(cfg.fogColor, near, far);
    }

    update(dt, cameraPos) {
        // Move sky dome with camera
        if (this.skyDome) {
            this.skyDome.position.x = cameraPos.x;
            this.skyDome.position.z = cameraPos.z;
        }
        if (this.stars) {
            this.stars.position.x = cameraPos.x;
            this.stars.position.z = cameraPos.z;
        }

        // Animate clouds
        const time = performance.now() * 0.001;
        for (const cloud of this.clouds) {
            cloud.position.x += cloud.userData.driftSpeed * dt;
            cloud.position.y = cloud.userData.baseY + Math.sin(time * cloud.userData.bobSpeed + cloud.userData.bobOffset) * 5;

            // Wrap clouds
            if (cloud.position.x > cameraPos.x + 8000) cloud.position.x -= 16000;
            if (cloud.position.x < cameraPos.x - 8000) cloud.position.x += 16000;
            if (cloud.position.z > cameraPos.z + 8000) cloud.position.z -= 16000;
            if (cloud.position.z < cameraPos.z - 8000) cloud.position.z += 16000;
        }

        // Move sun with camera
        if (this.sunLight) {
            const cfg = this._getTimeConfig();
            this.sunLight.position.set(
                cameraPos.x + cfg.sunPos.x,
                cfg.sunPos.y,
                cameraPos.z + cfg.sunPos.z
            );
        }
    }
}
