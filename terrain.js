// terrain.js - Procedural terrain generation with LOD and water

class TerrainManager {
    constructor(scene) {
        this.scene = scene;
        this.chunks = new Map();
        this.chunkSize = 512;
        this.resolution = 64;
        this.viewDistance = 5; // chunks in each direction
        this.water = null;
        this.runway = null;
    }

    init() {
        this.airports = [
            { x: 0, z: 0 },
            { x: 0, z: -15000 },
            { x: 15000, z: 0 },
            { x: -15000, z: 0 },
            { x: 0, z: 15000 }
        ];

        this._createWater();
        
        for (const ap of this.airports) {
            const group = new THREE.Group();
            group.position.set(ap.x, 0, ap.z);
            this._createRunway(group);
            this._createAirportBuildings(group);
            this.scene.add(group);
        }
    }

    // Simple multi-octave noise
    _noise2D(x, z) {
        // Simple value noise implementation
        const hash = (x, z) => {
            let h = (x * 374761393 + z * 668265263 + 1234567) & 0x7fffffff;
            h = ((h >> 13) ^ h) * 1274126177;
            h = ((h >> 16) ^ h);
            return (h & 0x7fffffff) / 0x7fffffff;
        };

        const smoothNoise = (x, z) => {
            const ix = Math.floor(x);
            const iz = Math.floor(z);
            const fx = x - ix;
            const fz = z - iz;
            // Smoothstep
            const u = fx * fx * (3 - 2 * fx);
            const v = fz * fz * (3 - 2 * fz);

            const a = hash(ix, iz);
            const b = hash(ix + 1, iz);
            const c = hash(ix, iz + 1);
            const d = hash(ix + 1, iz + 1);

            return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
        };

        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxVal = 0;

        // 6 octaves for nice terrain
        for (let i = 0; i < 6; i++) {
            value += smoothNoise(x * frequency, z * frequency) * amplitude;
            maxVal += amplitude;
            amplitude *= 0.45;
            frequency *= 2.2;
        }

        return value / maxVal;
    }

    getHeightAt(worldX, worldZ) {
        const scale = 0.002;
        const n = this._noise2D(worldX * scale, worldZ * scale);

        // Create varied terrain: plains, hills, mountains
        let height = 0;

        // Base terrain
        height = n * 400 - 80;

        // Flatten around closest airport
        let minDist = Infinity;
        for (const ap of this.airports) {
            const dx = worldX - ap.x;
            const dz = worldZ - ap.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < minDist) minDist = d;
        }

        if (minDist < 1500) {
            // 平坦な空港エリアを広く取る
            let flat = 1.0;
            if (minDist > 1000) {
                flat = Math.max(0, 1 - (minDist - 1000) / 500);
            }
            height = height * (1 - flat * flat) + 0 * flat * flat;
        }

        // Water level clamping (beaches)
        if (height < -5 && height > -30) {
            height = -5 + (height + 5) * 0.3; // Gentle beach
        }

        return height;
    }

    _createChunk(cx, cz) {
        const key = `${cx},${cz}`;
        if (this.chunks.has(key)) return;

        const geo = new THREE.PlaneGeometry(
            this.chunkSize, this.chunkSize,
            this.resolution, this.resolution
        );
        geo.rotateX(-Math.PI / 2);

        const positions = geo.attributes.position.array;
        const colors = new Float32Array(positions.length);

        for (let i = 0; i < positions.length; i += 3) {
            const worldX = positions[i] + cx * this.chunkSize;
            const worldZ = positions[i + 2] + cz * this.chunkSize;
            const h = this.getHeightAt(worldX, worldZ);
            positions[i + 1] = h;

            // Color based on height
            let r, g, b;
            if (h < -3) {
                // Sand / beach
                r = 0.76; g = 0.70; b = 0.50;
            } else if (h < 30) {
                // Grass
                const t = (h + 3) / 33;
                r = 0.15 + t * 0.1;
                g = 0.45 + t * 0.15;
                b = 0.12 + t * 0.05;
            } else if (h < 120) {
                // Forest / dark green
                const t = (h - 30) / 90;
                r = 0.12 + t * 0.15;
                g = 0.35 - t * 0.1;
                b = 0.10 + t * 0.05;
            } else if (h < 200) {
                // Rocky
                const t = (h - 120) / 80;
                r = 0.35 + t * 0.2;
                g = 0.30 + t * 0.15;
                b = 0.25 + t * 0.1;
            } else {
                // Snow caps
                const t = Math.min((h - 200) / 100, 1);
                r = 0.55 + t * 0.4;
                g = 0.50 + t * 0.45;
                b = 0.50 + t * 0.45;
            }
            colors[i] = r;
            colors[i + 1] = g;
            colors[i + 2] = b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: false,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Add trees to this chunk
        this._addTrees(mesh, cx, cz);

        this.chunks.set(key, mesh);
    }

    _addTrees(chunkMesh, cx, cz) {
        const treeGroup = new THREE.Group();
        const treeCount = 15;

        for (let i = 0; i < treeCount; i++) {
            const lx = (Math.random() - 0.5) * this.chunkSize;
            const lz = (Math.random() - 0.5) * this.chunkSize;
            const worldX = lx + cx * this.chunkSize;
            const worldZ = lz + cz * this.chunkSize;
            const h = this.getHeightAt(worldX, worldZ);

            // Only place trees in certain height range
            if (h < 5 || h > 150) continue;

            // Distance from runway
            const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
            if (dist < 400) continue;

            const tree = this._makeTree();
            tree.position.set(lx, h, lz);
            treeGroup.add(tree);
        }
        chunkMesh.add(treeGroup);
    }

    _makeTree() {
        const group = new THREE.Group();
        const height = 8 + Math.random() * 12;

        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.8, 1.2, height * 0.35, 5);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = height * 0.175;
        group.add(trunk);

        // Foliage (cone)
        const foliageGeo = new THREE.ConeGeometry(height * 0.3, height * 0.7, 6);
        const foliageMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(0.28 + Math.random() * 0.08, 0.6, 0.2 + Math.random() * 0.1)
        });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = height * 0.65;
        group.add(foliage);

        group.scale.setScalar(0.8 + Math.random() * 0.5);
        return group;
    }

    _createWater() {
        const waterGeo = new THREE.PlaneGeometry(30000, 30000);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshPhongMaterial({
            color: 0x1a6088,
            transparent: true,
            opacity: 0.7,
            shininess: 100,
            specular: 0x88ccff,
        });
        this.water = new THREE.Mesh(waterGeo, waterMat);
        this.water.position.y = -5;
        this.scene.add(this.water);
    }

    _createRunway(targetGroup) {
        // Concrete material
        const concreteMat = new THREE.MeshPhongMaterial({ 
            color: 0x82878a, 
            specular: 0x111111,
            shininess: 5
        });

        // Main runway strip (Concrete)
        const runwayGeo = new THREE.PlaneGeometry(50, 1200);
        runwayGeo.rotateX(-Math.PI / 2);
        this.runway = new THREE.Mesh(runwayGeo, concreteMat);
        this.runway.position.set(0, 0.2, 0);
        this.runway.receiveShadow = true;
        targetGroup.add(this.runway);

        // Taxiway (parallel)
        const taxiGeo = new THREE.PlaneGeometry(20, 1200);
        taxiGeo.rotateX(-Math.PI / 2);
        const taxiway = new THREE.Mesh(taxiGeo, concreteMat);
        taxiway.position.set(80, 0.15, 0);
        taxiway.receiveShadow = true;
        targetGroup.add(taxiway);

        // Connecting taxiways
        for(let z of [-500, -250, 0, 250, 500]) {
            const connGeo = new THREE.PlaneGeometry(60, 20);
            connGeo.rotateX(-Math.PI / 2);
            const conn = new THREE.Mesh(connGeo, concreteMat);
            conn.position.set(40, 0.16, z);
            conn.receiveShadow = true;
            targetGroup.add(conn);
        }

        // Apron (Parking area)
        const apronGeo = new THREE.PlaneGeometry(200, 600);
        apronGeo.rotateX(-Math.PI / 2);
        const apron = new THREE.Mesh(apronGeo, concreteMat);
        apron.position.set(190, 0.14, 0);
        apron.receiveShadow = true;
        targetGroup.add(apron);

        // Dark skid marks on runway
        const skidGeo = new THREE.PlaneGeometry(10, 300);
        skidGeo.rotateX(-Math.PI / 2);
        const skidMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.3 });
        for (let side of [-1, 1]) {
            const skid = new THREE.Mesh(skidGeo, skidMat);
            skid.position.set(0, 0.22, side * 400);
            targetGroup.add(skid);
        }

        // Runway center line markings
        const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = -580; i < 580; i += 40) {
            const markGeo = new THREE.PlaneGeometry(1, 15);
            markGeo.rotateX(-Math.PI / 2);
            const mark = new THREE.Mesh(markGeo, markMat);
            mark.position.set(0, 0.25, i);
            targetGroup.add(mark);
        }

        // Taxiway center lines (Yellow)
        const taxiMarkMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        for (let i = -580; i < 580; i += 20) {
            const tMarkGeo = new THREE.PlaneGeometry(0.6, 10);
            tMarkGeo.rotateX(-Math.PI / 2);
            const tMark = new THREE.Mesh(tMarkGeo, taxiMarkMat);
            tMark.position.set(80, 0.2, i);
            targetGroup.add(tMark);
        }

        // Edge lines
        for (let side = -1; side <= 1; side += 2) {
            const edgeGeo = new THREE.PlaneGeometry(0.5, 1200);
            edgeGeo.rotateX(-Math.PI / 2);
            const edge = new THREE.Mesh(edgeGeo, markMat);
            edge.position.set(side * 24, 0.25, 0);
            this.scene.add(edge);
        }

        // Runway threshold markings (Piano keys)
        for (let side = -1; side <= 1; side += 2) {
            for (let j = 0; j < 6; j++) {
                const tGeo = new THREE.PlaneGeometry(2, 30);
                tGeo.rotateX(-Math.PI / 2);
                const t = new THREE.Mesh(tGeo, markMat);
                t.position.set(-12.5 + j * 5, 0.25, side * 575);
                this.scene.add(t);
            }
        }

        // Runway & Taxiway lights
        for (let i = -600; i <= 600; i += 30) {
            // Runway edges (White/Red)
            for (let side = -1; side <= 1; side += 2) {
                const lightGeo = new THREE.SphereGeometry(0.3, 4, 4);
                const isEnd = Math.abs(i) > 500;
                const lightMat = new THREE.MeshBasicMaterial({
                    color: isEnd ? 0xff3333 : 0xffffff,
                    emissive: isEnd ? 0xff3333 : 0xffffff,
                });
                const light = new THREE.Mesh(lightGeo, lightMat);
                light.position.set(side * 26, 0.5, i);
                this.scene.add(light);
            }
            
            // Taxiway edges (Blue)
            if (i >= -550 && i <= 550) {
                for (let side = -1; side <= 1; side += 2) {
                    const bLightGeo = new THREE.SphereGeometry(0.2, 4, 4);
                    const bLightMat = new THREE.MeshBasicMaterial({ color: 0x0044ff, emissive: 0x0044ff });
                    const bLight = new THREE.Mesh(bLightGeo, bLightMat);
                    bLight.position.set(80 + side * 11, 0.4, i);
                    this.scene.add(bLight);
                }
            }
        }
    }

    _createAirportBuildings(targetGroup) {
        const buildingsGroup = new THREE.Group();

        // Materials
        const glassMat = new THREE.MeshPhongMaterial({ 
            color: 0x88ccff, 
            transparent: true, 
            opacity: 0.7,
            shininess: 90,
            specular: 0xffffff
        });
        const wallMat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
        const darkWallMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const roofMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

        // Main Terminal
        const terminalGeo = new THREE.BoxGeometry(100, 20, 60);
        const terminal = new THREE.Mesh(terminalGeo, glassMat);
        terminal.position.set(190, 10, 0);
        terminal.castShadow = true;
        terminal.receiveShadow = true;
        buildingsGroup.add(terminal);

        // Terminal Roof
        const termRoofGeo = new THREE.BoxGeometry(105, 2, 65);
        const termRoof = new THREE.Mesh(termRoofGeo, roofMat);
        termRoof.position.set(190, 21, 0);
        buildingsGroup.add(termRoof);

        // Terminal concourses (Gates)
        for(let side of [-1, 1]) {
            const concGeo = new THREE.BoxGeometry(20, 15, 120);
            const concourse = new THREE.Mesh(concGeo, wallMat);
            concourse.position.set(150, 7.5, side * 90);
            concourse.castShadow = true;
            buildingsGroup.add(concourse);
            
            // Jetways
            for(let j = -40; j <= 40; j += 40) {
                const jetGeo = new THREE.BoxGeometry(15, 4, 4);
                const jetway = new THREE.Mesh(jetGeo, darkWallMat);
                jetway.position.set(132.5, 8, side * 90 + j);
                buildingsGroup.add(jetway);
            }
        }

        // Control Tower
        const towerGroup = new THREE.Group();
        towerGroup.position.set(200, 0, -150);

        const pillarGeo = new THREE.CylinderGeometry(3, 4, 50, 8);
        const pillar = new THREE.Mesh(pillarGeo, wallMat);
        pillar.position.y = 25;
        towerGroup.add(pillar);

        const cabGeo = new THREE.CylinderGeometry(8, 6, 10, 8);
        const cab = new THREE.Mesh(cabGeo, glassMat);
        cab.position.y = 55;
        towerGroup.add(cab);

        const cabRoofGeo = new THREE.CylinderGeometry(8.5, 8, 2, 8);
        const cabRoof = new THREE.Mesh(cabRoofGeo, darkWallMat);
        cabRoof.position.y = 61;
        towerGroup.add(cabRoof);

        const radarGeo = new THREE.BoxGeometry(6, 1, 2);
        const radar = new THREE.Mesh(radarGeo, darkWallMat);
        radar.position.y = 63;
        // Simple rotation animation for radar could be added in update loop, but static for now
        radar.userData.isRadar = true;
        towerGroup.add(radar);

        buildingsGroup.add(towerGroup);

        // Hangars
        for(let z of [150, 220, 290]) {
            const hangarGroup = new THREE.Group();
            hangarGroup.position.set(230, 0, z);

            const hBodyGeo = new THREE.BoxGeometry(40, 15, 50);
            const hBody = new THREE.Mesh(hBodyGeo, wallMat);
            hBody.position.y = 7.5;
            hangarGroup.add(hBody);

            const hRoofGeo = new THREE.CylinderGeometry(20, 20, 50, 16, 1, false, 0, Math.PI);
            hRoofGeo.rotateZ(Math.PI / 2);
            hRoofGeo.rotateY(Math.PI / 2);
            const hRoof = new THREE.Mesh(hRoofGeo, roofMat);
            hRoof.position.y = 15;
            hangarGroup.add(hRoof);

            buildingsGroup.add(hangarGroup);
        }

        targetGroup.add(buildingsGroup);
    }

    update(cameraPos) {
        const camChunkX = Math.round(cameraPos.x / this.chunkSize);
        const camChunkZ = Math.round(cameraPos.z / this.chunkSize);

        // Create nearby chunks
        for (let x = camChunkX - this.viewDistance; x <= camChunkX + this.viewDistance; x++) {
            for (let z = camChunkZ - this.viewDistance; z <= camChunkZ + this.viewDistance; z++) {
                this._createChunk(x, z);
            }
        }

        // Remove far chunks
        for (const [key, mesh] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (Math.abs(cx - camChunkX) > this.viewDistance + 1 ||
                Math.abs(cz - camChunkZ) > this.viewDistance + 1) {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                this.chunks.delete(key);
            }
        }

        // Move water with camera
        if (this.water) {
            this.water.position.x = cameraPos.x;
            this.water.position.z = cameraPos.z;
        }
    }
}
