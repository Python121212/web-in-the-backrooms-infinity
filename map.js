// map.js - 無限チャンク、壁高4m変更、蛍光灯メッシュ生成

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
        this.doorDatabase = new Map(); 
        
        // 影計算を動的に行うための壁メッシュ・蛍光灯の参照リスト
        this.shadowCasters = [];
        this.allLights = [];

        this.initMaterials();
    }

    initMaterials() {
        this.wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        this.wallMat.diffuseTexture = new BABYLON.Texture(this.levelData.wallTexture, this.scene);
        const wallSettings = this.levelData.materialSettings.wall;
        this.wallMat.diffuseColor = wallSettings.diffuseColor;
        this.wallMat.specularColor = wallSettings.specularColor;
        
        // 壁が高くなった(4m)ので、テクスチャが縦に引き伸ばされないように調整
        this.wallMat.diffuseTexture.uScale = wallSettings.uScale; 
        this.wallMat.diffuseTexture.vScale = 1.35; 

        this.ceilMat = new BABYLON.StandardMaterial("ceilMat", this.scene);
        this.ceilMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene);
        this.ceilMat.diffuseTexture.uScale = 16;
        this.ceilMat.diffuseTexture.vScale = 16;

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
        this.shadowCasters = []; // 影の対象をクリアして再集計
        this.allLights = [];

        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const k = `${cx},${cz}`;
                keepKeys.add(k);
                if (!this.activeChunks.has(k)) this.createChunkGeometry(cx, cz, k);
                
                // アクティブな壁とライトの位置を集約
                const cached = this.activeChunks.get(k);
                if (cached) {
                    if (cached.walls) this.shadowCasters.push(cached.walls);
                    if (cached.lights) this.allLights.push(...cached.lights);
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
        const wallHeight = 4.0; // 【修正】壁の高さを4mに変更

        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (this.levelData.generatePattern(cx, cz, x, z, this.gridSize)) {
                    const posX = startX + x * cellUnit + cellUnit / 2;
                    const posZ = startZ + z * cellUnit + cellUnit / 2;
                    // Y座標の中心を高さに合わせて 2.0 に変更
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

        // 蛍光灯の発光メッシュ
        const lightMat = new BABYLON.StandardMaterial(`lightMat_${chunkKey}`, this.scene);
        lightMat.emissiveColor = new BABYLON.Color3(0.95, 0.93, 0.7);
        lightMat.disableLighting = true;

        const lightPositions = [];
        for (let lx = 8; lx < this.chunkSize; lx += 16) {
            for (let lz = 8; lz < this.chunkSize; lz += 16) {
                const fixture = BABYLON.MeshBuilder.CreateBox(`fluo_${chunkKey}_${lx}_${lz}`, { width: 0.3, height: 0.05, depth: 1.6 }, this.scene);
                // 天井の高さ4mの直下に配置
                fixture.position.set(startX + lx, wallHeight - 0.03, startZ + lz);
                fixture.material = lightMat;
                meshes.push(fixture);
                
                // 光源計算用の中心座標を記録
                lightPositions.push(new BABYLON.Vector3(startX + lx, wallHeight - 0.3, startZ + lz));
            }
        }

        // 床
        const floor = BABYLON.MeshBuilder.CreatePlane(`floor_${chunkKey}`, { size: this.chunkSize }, this.scene);
        floor.position.set(startX + this.chunkSize / 2, 0, startZ + this.chunkSize / 2);
        floor.rotation.x = Math.PI / 2;
        floor.material = this.floorMat;
        floor.checkCollisions = true;
        meshes.push(floor);

        // 天井 (高さ 4.0m)
        const ceiling = BABYLON.MeshBuilder.CreatePlane(`ceil_${chunkKey}`, { size: this.chunkSize }, this.scene);
        ceiling.position.set(startX + this.chunkSize / 2, wallHeight, startZ + this.chunkSize / 2);
        ceiling.rotation.x = -Math.PI / 2;
        ceiling.material = this.ceilMat;
        meshes.push(ceiling);

        // 影システムと連携しやすくするためオブジェクトを分けて保管
        this.activeChunks.set(chunkKey, {
            meshes: meshes,
            walls: wallTemplate,
            lights: lightPositions
        });
    }
}
