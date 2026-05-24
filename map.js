// map.js - 無限チャンク、超軽量描画(Thin Instances)、及び出口ドア生成管理

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
        // 1. 壁マテリアル（提供テクスチャ）
        this.wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        const wallTex = new BABYLON.Texture(this.levelData.wallTexture, this.scene);
        this.wallMat.diffuseTexture = wallTex;

        const wallSettings = this.levelData.materialSettings.wall;
        this.wallMat.diffuseColor = wallSettings.diffuseColor;
        this.wallMat.specularColor = wallSettings.specularColor;
        this.wallMat.specularPower = wallSettings.specularPower;
        this.wallMat.diffuseTexture.uScale = wallSettings.uScale; 
        this.wallMat.diffuseTexture.vScale = wallSettings.vScale;

        // 2. 天井マテリアル
        this.ceilMat = new BABYLON.StandardMaterial("ceilMat", this.scene);
        this.ceilMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene);

        // 3. 【修正】床マテリアル（別途独立させ、タイリング数を調整して引き伸ばしを防止）
        this.floorMat = new BABYLON.StandardMaterial("floorMat", this.scene);
        this.floorMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene); // 必要に応じて床用画像へ変更
        this.floorMat.diffuseTexture.uScale = 8; // チャンク全体で綺麗にリピート
        this.floorMat.diffuseTexture.vScale = 8;
        this.floorMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
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
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const k = `${cx},${cz}`;
                keepKeys.add(k);
                if (!this.activeChunks.has(k)) {
                    this.createChunkGeometry(cx, cz, k);
                }
            }
        }
        for (const [k, chunkMeshes] of this.activeChunks.entries()) {
            if (!keepKeys.has(k)) {
                chunkMeshes.forEach(mesh => mesh.dispose());
                this.activeChunks.delete(k);
            }
        }
    }

    isDoorNearby(cx, cz) {
        const checkRange = 3;
        for (let dx = -checkRange; dx <= checkRange; dx++) {
            for (let dz = -checkRange; dz <= checkRange; dz++) {
                if (this.doorDatabase.has(`${cx + dx},${cz + dz}`)) return true;
            }
        }
        return false;
    }

    createChunkGeometry(cx, cz, chunkKey) {
        const chunkMeshes = [];
        const wallMatrices = [];
        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;
        const cellUnit = this.chunkSize / this.gridSize;

        let spawnedDoorInfo = null;
        if (this.doorDatabase.has(chunkKey)) {
            spawnedDoorInfo = this.doorDatabase.get(chunkKey);
        } else if (!this.isDoorNearby(cx, cz) && seededRandom(cx, cz, 777) < 0.001) {
            const typeRand = seededRandom(cx, cz, 888);
            let doorType = "next";
            if (typeRand < 0.33) doorType = "minus";
            else if (typeRand < 0.66) doorType = "sub";

            const doorGridX = Math.floor(seededRandom(cx, cz, 111) * 12) + 2;
            const doorGridZ = Math.floor(seededRandom(cx, cz, 222) * 12) + 2;
            spawnedDoorInfo = { cx, cz, type: doorType, gridX: doorGridX, gridZ: doorGridZ };
            this.doorDatabase.set(chunkKey, spawnedDoorInfo);
        }

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
            const wallTemplate = BABYLON.MeshBuilder.CreateBox(`wallInst_${chunkKey}`, {
                width: cellUnit, height: 3.0, depth: cellUnit
            }, this.scene);
            wallTemplate.material = this.wallMat;
            wallTemplate.checkCollisions = true;
            const buffer = new Float32Array(16 * wallMatrices.length);
            for (let i = 0; i < wallMatrices.length; i++) wallMatrices[i].copyToArray(buffer, i * 16);
            wallTemplate.thinInstanceSetBuffer("matrix", buffer, 16);
            chunkMeshes.push(wallTemplate);
        }

        if (spawnedDoorInfo) {
            const dX = startX + spawnedDoorInfo.gridX * cellUnit + cellUnit / 2;
            const dZ = startZ + spawnedDoorInfo.gridZ * cellUnit + cellUnit / 2;
            const doorMesh = BABYLON.MeshBuilder.CreateBox(`door_${chunkKey}`, { width: 1.2, height: 2.2, depth: 0.2 }, this.scene);
            doorMesh.position.set(dX, 1.1, dZ);
            doorMesh.checkCollisions = true;
            const doorMat = new BABYLON.StandardMaterial(`doorMat_${chunkKey}`, this.scene);
            if (spawnedDoorInfo.type === "minus") doorMat.diffuseColor = new BABYLON.Color3(0.4, 0, 0);
            else if (spawnedDoorInfo.type === "sub") doorMat.diffuseColor = new BABYLON.Color3(0, 0.4, 0);
            else doorMat.diffuseColor = new BABYLON.Color3(0, 0, 0.5);
            doorMesh.material = doorMat;
            chunkMeshes.push(doorMesh);
        }

        // 【修正】床面の向きとマテリアルの全面見直し
        const floor = BABYLON.MeshBuilder.CreatePlane(`floor_${chunkKey}`, { size: this.chunkSize }, this.scene);
        floor.position.set(startX + this.chunkSize / 2, 0, startZ + this.chunkSize / 2);
        floor.rotation.x = Math.PI / 2; // 正しい上向き水平
        floor.material = this.floorMat; // 専用の床マテリアル
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
