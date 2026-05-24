// map.js - 無限チャンク、超軽量描画(Thin Instances)、及び出口ドア生成管理

// 座標とシード値から決定論的な擬似乱数を返す関数（サーバー・クライアント共通化ロジック）
function seededRandom(x, z, seed = 12345) {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453123;
    return h - Math.floor(h);
}

export class ChunkManager {
    constructor(scene, levelData) {
        this.scene = scene;
        this.levelData = levelData;
        this.chunkSize = 32;          // 1チャンクの一辺の長さ (メートル)
        this.gridSize = 16;           // 1チャンクの中のマス目 (1マス2m×2m)
        this.currentChunkKey = "";    // プレイヤーが現在いるチャンクのキー
        this.activeChunks = new Map(); // 現在画面に描画（ロード）されているチャンクのメッシュ配列

        // 【MMO見据え】生成された特別なドアの位置情報を記録するデータベース
        // キー: "cx,cz" -> 値: { cx, cz, type: 'next'|'sub'|'minus', position: Vector3 }
        this.doorDatabase = new Map(); 

        this.initMaterials();
    }

    /**
     * マテリアル（テクスチャ・質感）の初期化
     */
    initMaterials() {
        // 1. 壁マテリアルの設定（ご提供いただいた level0wall.png を適用）
        this.wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        const wallTex = new BABYLON.Texture(this.levelData.wallTexture, this.scene);
        this.wallMat.diffuseTexture = wallTex;

        // level0.js側で定義された、湿った不気味な壁の質感を反映
        const wallSettings = this.levelData.materialSettings.wall;
        this.wallMat.diffuseColor = wallSettings.diffuseColor;
        this.wallMat.specularColor = wallSettings.specularColor;
        this.wallMat.specularPower = wallSettings.specularPower;
        this.wallMat.diffuseTexture.uScale = wallSettings.uScale; 
        this.wallMat.diffuseTexture.vScale = wallSettings.vScale;

        // 2. 床・天井マテリアルの設定
        this.ceilMat = new BABYLON.StandardMaterial("ceilMat", this.scene);
        this.ceilMat.diffuseTexture = new BABYLON.Texture(this.levelData.ceilingTexture, this.scene);
    }

    /**
     * プレイヤーの現在座標から周辺チャンクのロード・アンロードを監視（毎フレーム実行）
     */
    update(playerX, playerZ) {
        const currentCx = Math.floor(playerX / this.chunkSize);
        const currentCz = Math.floor(playerZ / this.chunkSize);
        const key = `${currentCx},${currentCz}`;

        // プレイヤーが新しいチャンクに跨いだ場合のみ、周囲のマップを再計算
        if (key !== this.currentChunkKey) {
            this.currentChunkKey = key;
            this.manageChunks(currentCx, currentCz);
        }
    }

    /**
     * プレイヤー周辺の3x3（計9チャンク）を維持し、範囲外をメモリから解放する
     */
    manageChunks(centerCx, centerCz) {
        const keepKeys = new Set();

        // 周辺3x3チャンクをループ
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const cx = centerCx + dx;
                const cz = centerCz + dz;
                const k = `${cx},${cz}`;
                keepKeys.add(k);

                // まだ読み込まれていないチャンクであれば新規生成
                if (!this.activeChunks.has(k)) {
                    this.createChunkGeometry(cx, cz, k);
                }
            }
        }

        // 3x3の範囲外になった古いチャンクのメッシュを完全に削除（軽量化の肝）
        for (const [k, chunkMeshes] of this.activeChunks.entries()) {
            if (!keepKeys.has(k)) {
                chunkMeshes.forEach(mesh => mesh.dispose());
                this.activeChunks.delete(k);
            }
        }
    }

    /**
     * 指定されたチャンクの周囲3チャンク以内に既にドアが存在するかチェック
     */
    isDoorNearby(cx, cz) {
        const checkRange = 3;
        for (let dx = -checkRange; dx <= checkRange; dx++) {
            for (let dz = -checkRange; dz <= checkRange; dz++) {
                const targetKey = `${cx + dx},${cz + dz}`;
                if (this.doorDatabase.has(targetKey)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 1つのチャンク（壁・床・天井・ドア）をシード値に基づいて生成
     */
    createChunkGeometry(cx, cz, chunkKey) {
        const chunkMeshes = [];
        const wallMatrices = [];

        const startX = cx * this.chunkSize;
        const startZ = cz * this.chunkSize;
        const cellUnit = this.chunkSize / this.gridSize; // 1マスのサイズ（2メートル）

        // ----------------------------------------------------
        // 出口ドアの生成判定 (確率 0.1% = 0.001)
        // ----------------------------------------------------
        let spawnedDoorInfo = null;

        // すでに過去にドア生成が確定している、または新規抽選で0.1%に当選し、かつ周囲3チャンク内にドアがない場合
        if (this.doorDatabase.has(chunkKey)) {
            spawnedDoorInfo = this.doorDatabase.get(chunkKey);
        } else if (!this.isDoorNearby(cx, cz) && seededRandom(cx, cz, 777) < 0.001) {
            // ドアのタイプ（マイナスレベル、サブレベル、次のレベル）をさらに確率で決定
            const typeRand = seededRandom(cx, cz, 888);
            let doorType = "next";
            if (typeRand < 0.33) doorType = "minus";
            else if (typeRand < 0.66) doorType = "sub";

            // ドアを配置するチャンク内のGrid座標をランダム決定 (外周を避けた内側の2〜13マス目)
            const doorGridX = Math.floor(seededRandom(cx, cz, 111) * 12) + 2;
            const doorGridZ = Math.floor(seededRandom(cx, cz, 222) * 12) + 2;

            spawnedDoorInfo = {
                cx, cz,
                type: doorType,
                gridX: doorGridX,
                gridZ: doorGridZ
            };

            // 【MMO対応】サーバー側（データ層）に保存されるべき情報として記録
            this.doorDatabase.set(chunkKey, spawnedDoorInfo);
            console.log(`[サーバー同期対象] ドアが出現しました！ チャンク:${chunkKey} タイプ:${doorType}`);
        }

        // ----------------------------------------------------
        // マップ（迷路）データの生成ループ
        // ----------------------------------------------------
        for (let x = 0; x < this.gridSize; x++) {
            for (let z = 0; z < this.gridSize; z++) {
                
                // ドアが生成されたマスは、進入できるように強制的に壁を消去する
                if (spawnedDoorInfo && spawnedDoorInfo.gridX === x && spawnedDoorInfo.gridZ === z) {
                    continue; 
                }

                // level0.js の独自のアルゴリズムから壁にするかを取得
                const isWall = this.levelData.generatePattern(cx, cz, x, z, this.gridSize);

                if (isWall) {
                    const posX = startX + x * cellUnit + cellUnit / 2;
                    const posZ = startZ + z * cellUnit + cellUnit / 2;
                    const posY = 1.5; // 壁の高さの中央値

                    // Thin Instance用の配置用行列を作成
                    const matrix = BABYLON.Matrix.Translation(posX, posY, posZ);
                    wallMatrices.push(matrix);
                }
            }
        }

        // ----------------------------------------------------
        // Thin Instances による壁の高速一括描画
        // ----------------------------------------------------
        if (wallMatrices.length > 0) {
            const wallTemplate = BABYLON.MeshBuilder.CreateBox(`wallInst_${chunkKey}`, {
                width: cellUnit, height: 3.0, depth: cellUnit
            }, this.scene);
            
            wallTemplate.material = this.wallMat;
            wallTemplate.checkCollisions = true; // 当たり判定の有効化

            // 全ての壁の位置行列を一バッファにまとめて流し込む
            const buffer = new Float32Array(16 * wallMatrices.length);
            for (let i = 0; i < wallMatrices.length; i++) {
                wallMatrices[i].copyToArray(buffer, i * 16);
            }
            wallTemplate.thinInstanceSetBuffer("matrix", buffer, 16);
            chunkMeshes.push(wallTemplate);
        }

        // ----------------------------------------------------
        // 出口ドアの3Dオブジェクト配置 (当選時のみ1つだけ生成)
        // ----------------------------------------------------
        if (spawnedDoorInfo) {
            const dX = startX + spawnedDoorInfo.gridX * cellUnit + cellUnit / 2;
            const dZ = startZ + spawnedDoorInfo.gridZ * cellUnit + cellUnit / 2;

            // 本来は BABYLON.SceneLoader.ImportMesh で "model/Door.glb" を読み込むが、
            // ここでは仮のドアとして、種類ごとに色の異なる薄いBoxを生成
            const doorMesh = BABYLON.MeshBuilder.CreateBox(`door_${chunkKey}`, {
                width: 1.2, height: 2.2, depth: 0.2
            }, this.scene);
            doorMesh.position.set(dX, 1.1, dZ);
            doorMesh.checkCollisions = true;

            // ドアのタイプに応じて色を変える簡易ビジュアル設定
            const doorMat = new BABYLON.StandardMaterial(`doorMat_${chunkKey}`, this.scene);
            if (spawnedDoorInfo.type === "minus") doorMat.diffuseColor = new BABYLON.Color3(0.5, 0, 0); // 赤（マイナス）
            else if (spawnedDoorInfo.type === "sub") doorMat.diffuseColor = new BABYLON.Color3(0, 0.5, 0); // 緑（サブ）
            else doorMat.diffuseColor = new BABYLON.Color3(0, 0, 0.8); // 青（通常次レベル）
            
            doorMesh.material = doorMat;
            chunkMeshes.push(doorMesh);
        }

        // ----------------------------------------------------
        // 床 と 天井 の生成
        // ----------------------------------------------------
        const floor = BABYLON.MeshBuilder.CreatePlane(`floor_${chunkKey}`, { size: this.chunkSize }, this.scene);
        floor.position.set(startX + this.chunkSize / 2, 0, startZ + this.chunkSize / 2);
        floor.rotation.x = Math.PI / 2;
        floor.material = this.ceilMat;
        floor.checkCollisions = true;
        chunkMeshes.push(floor);

        const ceiling = BABYLON.MeshBuilder.CreatePlane(`ceil_${chunkKey}`, { size: this.chunkSize }, this.scene);
        ceiling.position.set(startX + this.chunkSize / 2, 3.0, startZ + this.chunkSize / 2);
        ceiling.rotation.x = -Math.PI / 2;
        ceiling.material = this.ceilMat;
        chunkMeshes.push(ceiling);

        // このチャンクに属する全メッシュをアクティブリストに登録
        this.activeChunks.set(chunkKey, chunkMeshes);
    }
}
