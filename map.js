// map.js - 無限チャンク、超軽量描画(Thin Instances)、蛍光灯オブジェクト生成

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
        this.wallMat.diffuseTexture.vScale = wallSettings.vScale;

        // 天井
        this.ceilMat = new BABYLON.StandardMaterial("ceilMat", this.scene);
        this.ceilMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene);
        this.ceilMat.diffuseTexture.uScale = 12;
        this.ceilMat.diffuseTexture.vScale = 12;

        // 【修正】床を暗い湿ったカーペット調に修正（チェック柄を完全に排除）
        this.floorMat = new BABYLON.StandardMaterial("floorMat", this.scene);
        this.floorMat.diffuseColor = new BABYLON.Color3(0.38, 0.35, 0.22); // 暗い黄土色
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
        for (let dx = -2; dx <= 2; dx++) { // 霧で見えなくなる限界まで生成範囲を調整
            for (let dz = -2; dz <= 2; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const k = `${cx},${cz}`;
                keepKeys.add(k);
                if (!this.activeChunks.has(k)) this.createChunkGeometry(cx, cz, k);
            }
        }
        for (const [k, chunkMeshes] of this.activeChunks.entries()) {
            if (!keepKeys.has(k)) {
                chunkMeshes.forEach(mesh => mesh.dispose());
                this.activeChunks.delete(k);
            }
        }
    }

    createChunkGeometry(cx, cz, chunkKey) {
        const chunkMeshes = [];
        const wallMatrices = [];
        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;
        const cellUnit = this.chunkSize / this.gridSize;

        // ドア抽選
        let spawnedDoorInfo = null;
        if (this.doorDatabase.has(chunkKey)) {
            spawnedDoorInfo = this.doorDatabase.get(chunkKey);
        } else if (seededRandom(cx, cz, 777) < 0.001) {
            const doorGridX = Math.floor(seededRandom(cx, cz, 111) * 12) + 2;
            const doorGridZ = Math.floor(seededRandom(cx, cz, 222) * 12) + 2;
            spawnedDoorInfo = { cx, cz, type: "next", gridX: doorGridX, gridZ: doorGridZ };
            this.doorDatabase.set(chunkKey, spawnedDoorInfo);
        }

        // 壁生成ループ
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                if (spawnedDoorInfo && spawnedDoorInfo.gridX === x && spawnedDoorInfo.gridZ === z) continue; 
                if (this.levelData.generatePattern(cx, cz, x, z, this.gridSize)) {
                    const posX = startX + x * cellUnit + cellUnit / 2;
                    const posZ = startZ + z * cellUnit + cellUnit / 2;
                    wallMatrices.push(BABYLON.Matrix.Translation(posX, 1.5, posZ));
                }
            }
        }

        if (wallMatrices.length > 0) {
            const wallTemplate = BABYLON.MeshBuilder.CreateBox(`wallInst_${chunkKey}`, { width: cellUnit, height: 3.0, depth: cellUnit }, this.scene);
            wallTemplate.material = this.wallMat;
            wallTemplate.checkCollisions = true;
            const buffer = new Float32Array(16 * wallMatrices.length);
            for (let i = 0; i < wallMatrices.length; i++) wallMatrices[i].copyToArray(buffer, i * 16);
            wallTemplate.thinInstanceSetBuffer("matrix", buffer, 16);
            chunkMeshes.push(wallTemplate);
        }

        // 【新機能】天井に並ぶ不気味な「蛍光灯」の3Dオブジェクト配置（等間隔）
        const lightMat = new BABYLON.StandardMaterial(`lightMat_${chunkKey}`, this.scene);
        lightMat.emissiveColor = new BABYLON.Color3(0.9, 0.88, 0.6); // 自ら暗い黄色に光る
        lightMat.disableLighting = true;

        for (let lx = 8; lx < this.chunkSize; lx += 16) {
            for (let lz = 8; lz < this.chunkSize; lz += 16) {
                const fixture = BABYLON.MeshBuilder.CreateBox(`fluo_${chunkKey}_${lx}_${lz}`, {
                    width: 0.4, height: 0.05, depth: 1.8
                }, this.scene);
                fixture.position.set(startX + lx, 2.97, startZ + lz);
                fixture.material = lightMat;
                chunkMeshes.push(fixture);
            }
        }

        // 床
        const floor = BABYLON.MeshBuilder.CreatePlane(`floor_${chunkKey}`, { size: this.chunkSize }, this.scene);
        floor.position.set(startX + this.chunkSize / 2, 0, startZ + this.chunkSize / 2);
        floor.rotation.x = Math.PI / 2;
        floor.material = this.floorMat;
        floor.checkCollisions = true;
        chunkMeshes.push(floor);

        // 天井
        const ceiling = BABYLON.MeshBuilder.CreatePlane(`ceil_${chunkKey}`, { size: this.chunkSize }, this.scene);
        ceiling.position.set(startX + this.chunkSize / 2, 3.0, startZ + this.chunkSize / 2);
        ceiling.rotation.x = -Math.PI / 2;
        ceiling.material = this.ceilMat;
        chunkMeshes.push(ceiling);

        this.activeChunks.set(chunkKey, chunkMeshes);
    }
}
