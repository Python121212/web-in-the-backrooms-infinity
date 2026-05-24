// map.js - 無限チャンク、壁高4m、天井テクスチャ修正、周囲360度ライト管理

function seededRandom(x, z, seed = 12345) {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453123;
    return h - Math.floor(h);
}

export class ChunkManager {
    constructor(scene, levelData) {
        this.scene = scene;
        this.levelData = levelData;
        this.chunkSize = 32;
        this.gridSize = 16;
        this.currentChunkKey = "";
        this.activeChunks = new Map();
        
        this.shadowCasters = [];
        this.lightSources = []; // 周囲のライト判定用の蛍光灯位置配列

        this.initMaterials();
    }

    initMaterials() {
        // 壁
        this.wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        this.wallMat.diffuseTexture = new BABYLON.Texture(this.levelData.wallTexture, this.scene);
        const wallSettings = this.levelData.materialSettings.wall;
        this.wallMat.diffuseColor = wallSettings.diffuseColor;
        this.wallMat.specularColor = wallSettings.specularColor;
        this.wallMat.diffuseTexture.uScale = wallSettings.uScale; 
        this.wallMat.diffuseTexture.vScale = 1.35; 

        // 天井 【修正】正しい天井テクスチャのパスを適用
        this.ceilMat = new BABYLON.StandardMaterial("ceilMat", this.scene);
        this.ceilMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene);
        this.ceilMat.diffuseTexture.uScale = 6; // 綺麗にタイル状に並ぶようにスケール調整
        this.ceilMat.diffuseTexture.vScale = 6;

        // 床
        this.floorMat = new BABYLON.StandardMaterial("floorMat", this.scene);
        this.floorMat.diffuseColor = new BABYLON.Color3(0.32, 0.29, 0.18); 
        this.floorMat.specularColor = new BABYLON.Color3(0.01, 0.01, 0.01);
    }

    update(playerX, playerZ) {
        const currentCx = Math.floor(playerX / this.chunkSize);
        const currentCz = Math.floor(playerZ / this.chunkSize);
        const key = `${currentCx},${currentCz}`;

        if (key !== this.currentChunkKey) {
            this.currentChunkKey = key;
            this.manageChunks(currentCx, currentCz);
        }
    }

    manageChunks(centerCx, centerCz) {
        const keepKeys = new Set();
        this.shadowCasters = [];
        this.lightSources = []; 

        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const k = `${cx},${cz}`;
                keepKeys.add(k);
                if (!this.activeChunks.has(k)) this.createChunkGeometry(cx, cz, k);
                
                const cached = this.activeChunks.get(k);
                if (cached) {
                    if (cached.walls) this.shadowCasters.push(cached.walls);
                    if (cached.lightPositions) this.lightSources.push(...cached.lightPositions);
                }
            }
        }

        for (const [k, chunkData] of this.activeChunks.entries()) {
            if (!keepKeys.has(k)) {
                chunkData.meshes.forEach(mesh => mesh.dispose());
                this.activeChunks.delete(k);
            }
        }
    }

    createChunkGeometry(cx, cz, chunkKey) {
        const meshes = [];
        const wallMatrices = [];
        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;
        const cellUnit = this.chunkSize / this.gridSize;
        const wallHeight = 4.0;

        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (this.levelData.generatePattern(cx, cz, x, z, this.gridSize)) {
                    const posX = startX + x * cellUnit + cellUnit / 2;
                    const posZ = startZ + z * cellUnit + cellUnit / 2;
                    wallMatrices.push(BABYLON.Matrix.Translation(posX, wallHeight / 2, posZ));
                }
            }
        }

        let wallTemplate = null;
        if (wallMatrices.length > 0) {
            wallTemplate = BABYLON.MeshBuilder.CreateBox(`wallInst_${chunkKey}`, { width: cellUnit, height: wallHeight, depth: cellUnit }, this.scene);
            wallTemplate.material = this.wallMat;
            wallTemplate.checkCollisions = true;
            const buffer = new Float32Array(16 * wallMatrices.length);
            for (let i = 0; i < wallMatrices.length; i++) wallMatrices[i].copyToArray(buffer, i * 16);
            wallTemplate.thinInstanceSetBuffer("matrix", buffer, 16);
            meshes.push(wallTemplate);
        }

        // 蛍光灯の発光マテリアル
        const lightMat = new BABYLON.StandardMaterial(`lightMat_${chunkKey}`, this.scene);
        lightMat.emissiveColor = new BABYLON.Color3(0.95, 0.93, 0.7);
        lightMat.disableLighting = true;

        const lightPositions = [];
        for (let lx = 8; lx < this.chunkSize; lx += 16) {
            for (let lz = 8; lz < this.chunkSize; lz += 16) {
                const fixture = BABYLON.MeshBuilder.CreateBox("fluo_" + chunkKey, { width: 0.3, height: 0.05, depth: 1.6 }, this.scene);
                fixture.position.set(startX + lx, wallHeight - 0.03, startZ + lz);
                fixture.material = lightMat;
                meshes.push(fixture);
                
                // 光源を配置する座標ベクトル（高さ3.8m）を記録
                lightPositions.push(new BABYLON.Vector3(startX + lx, wallHeight - 0.2, startZ + lz));
            }
        }

        // 床
        const floor = BABYLON.MeshBuilder.CreatePlane("floor_" + chunkKey, { size: this.chunkSize }, this.scene);
        floor.position.set(startX + this.chunkSize / 2, 0, startZ + this.chunkSize / 2);
        floor.rotation.x = Math.PI / 2;
        floor.material = this.floorMat;
        floor.checkCollisions = true;
        meshes.push(floor);

        // 天井 (高さ 4.0m)
        const ceiling = BABYLON.MeshBuilder.CreatePlane("ceil_" + chunkKey, { size: this.chunkSize }, this.scene);
        ceiling.position.set(startX + this.chunkSize / 2, wallHeight, startZ + this.chunkSize / 2);
        ceiling.rotation.x = Math.PI / 2; // 正しく下を向くように回転を統一
        ceiling.material = this.ceilMat;
        meshes.push(ceiling);

        this.activeChunks.set(chunkKey, {
            meshes: meshes,
            walls: wallTemplate,
            lightPositions: lightPositions
        });
    }
}
