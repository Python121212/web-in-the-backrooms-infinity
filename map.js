// map.js - 無限チャンク & 高速インスタンス描画システム

function seededRandom(x, z, seed = 12345) {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453123;
    return h - Math.floor(h);
}

export class ChunkManager {
    constructor(scene, levelData) {
        this.scene = scene;
        this.levelData = levelData;
        this.chunkSize = 32;       // 1チャンクの一辺の長さ (メートル)
        this.gridSize = 16;        // 1チャンクの中のマス目 (1マス2m×2m)
        this.currentChunkKey = "";
        this.activeChunks = new Map(); // 現在描画中のチャンク
        this.doorDatabase = new Map(); // ドアが確定したチャンクの保存先

        this.initMaterials();
    }

    // 壁、床、天井のマテリアル（テクスチャ）初期化
    initMaterials() {
        // 壁
        this.wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        this.wallMat.diffuseTexture = new BABYLON.Texture(this.levelData.wallTexture, this.scene);
        this.wallMat.diffuseTexture.uScale = 1; 
        this.wallMat.diffuseTexture.vScale = 1;

        // 床・天井
        this.ceilMat = new BABYLON.StandardMaterial("ceilMat", this.scene);
        this.ceilMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene);
    }

    // プレイヤーの位置を元に、周辺3x3チャンクをチェック・更新
    update(playerX, playerZ) {
        const currentCx = Math.floor(playerX / this.chunkSize);
        const currentCz = Math.floor(playerZ / this.chunkSize);
        const key = `${currentCx},${currentCz}`;

        // プレイヤーが別のチャンクに移動した場合のみ再計算
        if (key !== this.currentChunkKey) {
            this.currentChunkKey = key;
            this.manageChunks(currentCx, currentCz);
        }
    }

    manageChunks(centerCx, centerCz) {
        const keepKeys = new Set();

        // 中心から前後左右1チャンク（計9チャンク）を保持対象にする
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

        // 範囲外になった古いチャンクの描画データをメモリから削除
        for (const [k, chunkMeshes] of this.activeChunks.entries()) {
            if (!keepKeys.has(k)) {
                chunkMeshes.forEach(m => m.dispose());
                this.activeChunks.delete(k);
            }
        }
    }

    // 周囲3チャンク（正確には半径3マス）以内にドアがあるか
    isDoorNearby(cx, cz) {
        const checkRange = 3;
        for (let dx = -checkRange; dx <= checkRange; dx++) {
            for (let dz = -checkRange; dz <= checkRange; dz++) {
                if (this.doorDatabase.has(`${cx + dx},${cz + dz}`)) return true;
            }
        }
        return false;
    }

    // 1つのチャンク（迷路、床、天井）を実際に構築する関数
    createChunkGeometry(cx, cz, chunkKey) {
        const chunkMeshes = [];
        const wallMatrices = [];

        // 1. 出口ドアの抽選（0.1%の確率）
        let hasDoor = false;
        if (!this.isDoorNearby(cx, cz)) {
            if (seededRandom(cx, cz, 777) < 0.001) {
                hasDoor = true;
                this.doorDatabase.set(chunkKey, { cx, cz, type: "next" });
                console.log(`[Door Spawned!] Chunk: ${chunkKey}`);
            }
        }

        // 2. 迷路データの生成と壁位置ベクトルの作成
        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;
        const cellUnit = this.chunkSize / this.gridSize; // 1マスのサイズ (2m)

        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                // シード付き乱数を使ってレベル0のグリッド配置を決定
                const isWall = this.levelData.generatePattern(cx, cz, x, z, this.gridSize);

                if (isWall) {
                    // 壁のワールド座標を計算
                    const posX = startX + x * cellUnit + cellUnit / 2;
                    const posZ = startZ + z * cellUnit + cellUnit / 2;
                    const posY = 1.5; // 高さの半分

                    // Thin Instance用の配置行列（Matrix）を作成
                    const matrix = BABYLON.Matrix.Translation(posX, posY, posZ);
                    wallMatrices.push(matrix);
                }
            }
        }

        // 3. 壁モデルを1つ作り、Thin Instanceで一括配置（描画の超軽量化）
        if (wallMatrices.length > 0) {
            const wallTemplate = BABYLON.MeshBuilder.CreateBox(`wallInst_${chunkKey}`, {
                width: cellUnit, height: 3.0, depth: cellUnit
            }, this.scene);
            
            wallTemplate.material = this.wallMat;
            wallTemplate.checkCollisions = true; // 当たり判定の有効化

            // 全ての壁の位置行列を一括インジェクション
            const buffer = new Float32Array(16 * wallMatrices.length);
            for (let i = 0; i < wallMatrices.length; i++) {
                wallMatrices[i].copyToArray(buffer, i * 16);
            }
            wallTemplate.thinInstanceSetBuffer("matrix", buffer, 16);
            chunkMeshes.push(wallTemplate);
        }

        // 4. 床と天井の生成（1つのチャンクに対して巨大な板を上下に1枚ずつ配置）
        const floor = BABYLON.MeshBuilder.CreatePlane(`floor_${chunkKey}`, { size: this.chunkSize }, this.scene);
        floor.position.set(startX + this.chunkSize/2, 0, startZ + this.chunkSize/2);
        floor.rotation.x = Math.PI / 2;
        floor.material = this.ceilMat; // 今回は天井マテリアルを流用
        floor.checkCollisions = true;
        chunkMeshes.push(floor);

        const ceiling = BABYLON.MeshBuilder.CreatePlane(`ceil_${chunkKey}`, { size: this.chunkSize }, this.scene);
        ceiling.position.set(startX + this.chunkSize/2, 3.0, startZ + this.chunkSize/2);
        ceiling.rotation.x = -Math.PI / 2;
        ceiling.material = this.ceilMat;
        chunkMeshes.push(ceiling);

        // キャッシュに登録
        this.activeChunks.set(chunkKey, chunkMeshes);
    }
}
