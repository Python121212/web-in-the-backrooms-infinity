/**
 * map.js
 * レベル間の接続（入口・出口・Door）を管理するコアロジック
 * * 【プログラミング原則】
 * 1. 関心の分離：このファイルは「入口と出口の関係性」のみを記述し、オブジェクト配置は各レベルファイルに委ねる。
 * 2. 圧倒的な拡張性：新しいレベルやサブレベルが動的に追加できるデータ構造。
 * 3. MMOへの布石：Doorの生成座標や接続先をサーバーに同期しやすい独立関数設計。
 */

export class GameManager {
    constructor(engine, canvas, physicsPlugin, managers) {
        this.engine = engine;
        this.canvas = canvas;
        this.physicsPlugin = physicsPlugin;
        
        // 他のコアマネージャー（ui, items, entity, video）への参照
        this.ui = managers.ui;
        this.items = managers.items;
        this.entity = managers.entity;
        this.video = managers.video;

        this.scene = null;
        this.currentLevelId = "level0"; // 初期レベル
        this.activeChunks = new Map();  // 生成済みのチャンク情報を保持
        this.doorHistory = new Map();   // 生成されたDoorの座標と接続先の記録（MMO同期用データ構造）
        
        // レベル定義テーブル
        // 拡張性を担保するため、ID、タイプ、そして接続候補（出口）を配列で定義
        this.levelRegistry = {
            "level0": {
                name: "The Lobby",
                type: "normal",
                // 出口の接続先候補とそれぞれの重み（選択確率の比率）
                exits: [
                    { targetId: "manila-room", weight: 0.1 }, // マニラルーム（特殊だが通常レベル扱い）
                    { targetId: "level1",      weight: 0.7 }, // Level 1 (確率高め)
                    { targetId: "level-1",     weight: 0.2 }  // Level -1 (マイナスレベル)
                ]
            },
            "manila-room": {
                name: "The Manila Room",
                type: "normal",
                exits: [{ targetId: "level0", weight: 1.0 }] // Level 0 に戻る
            },
            "level1": {
                name: "Lurking Cold",
                type: "normal",
                exits: [{ targetId: "level2", weight: 0.8 }, { targetId: "level0.1Redroom", weight: 0.2 }]
            },
            "level-1": {
                name: "Subverted Reality",
                type: "minus",
                exits: [{ targetId: "level-2", weight: 1.0 }]
            },
            "level2": {
                name: "Pipe Dreams",
                type: "normal",
                exits: [{ targetId: "level0", weight: 1.0 }]
            },
            "level0.1Redroom": {
                name: "Redroom",
                type: "sub",
                exits: [{ targetId: "level1", weight: 1.0 }]
            }
        };
    }

    /**
     * ゲーム全体の初期化
     */
    async init() {
        this.scene = new BABYLON.Scene(this.engine);
        
        // 物理エンジンの有効化 (Havok)
        const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
        this.scene.enablePhysics(gravityVector, this.physicsPlugin);

        // UIの初期セットアップ
        this.ui.init(this);

        // 最初のレベルの読み込み
        await this.loadLevel(this.currentLevelId);

        // メインレンダーループの開始
        this.engine.runRenderLoop(() => {
            if (this.scene) {
                this.scene.render();
                // プレイヤーの現在地に応じた動的チャンク更新処理などをここに記述
                this.updateChunks();
            }
        });
    }

    /**
     * 特定のレベルをロードする
     * @param {string} levelId 
     */
    async loadLevel(levelId) {
        if (!this.levelRegistry[levelId]) {
            console.error(`Level ${levelId} がレジストリに見つかりません。`);
            return;
        }

        this.currentLevelId = levelId;
        const levelData = this.levelRegistry[levelId];
        
        // 既存のオブジェクト・チャンクのクリーンアップ
        this.clearCurrentLevel();

        console.log(`Loading: ${levelData.name} (${levelId})`);
        
        // UIに現在のレベル名を表示
        this.ui.showLevelNotification(levelData.name, levelData.type);

        // 【関心の分離】動的なレベルファイルの読み込み
        // 将来的に `levels/level0.js` などのモジュールを動的インポート(import)して
        // その中に定義された3D環境生成関数（環境光、テクスチャ、壁の配置等）を呼び出す
        try {
            let levelModulePath = `./levels/${levelId}.js`;
            if (levelData.type === "minus") levelModulePath = `./minus-levels/${levelId}.js`;
            if (levelData.type === "sub") levelModulePath = `./sub-levels/${levelId}.js`;

            // ※実際のファイルが存在しない場合のフォールバックを考慮し、
            // 現段階では擬似的にモジュール処理（またはベース生成）を行います。
            // const levelModule = await import(levelModulePath);
            // levelModule.generateEnvironment(this.scene, this);
            
            this.generateBaseEnvironmentPlaceholder(levelId);

        } catch (error) {
            console.warn(`固有のレベルファイルを読み込めなかったため、汎用生成を行います: ${error.message}`);
            this.generateBaseEnvironmentPlaceholder(levelId);
        }

        // アイテムやエンティティのマネージャーへレベル切り替えを通知
        this.items.onLevelChanged(levelId);
        this.entity.onLevelChanged(levelId);
    }

    /**
     * 各チャンクにおける出口（Door）の生成確率と制約アルゴリズム
     * @param {string} chunkKey "x_z" 形式のチャンク座標
     * @param {BABYLON.Vector3} chunkCenterPosition チャンクの中心座標
     */
    evaluateDoorGeneration(chunkKey, chunkCenterPosition) {
        // 1. 0.1% (0.001) の確率でDoorを生成する判定
        const spawnChance = 0.001;
        if (Math.random() > spawnChance) return null;

        // [x, z] の数値座標を取得
        const [cx, cz] = chunkKey.split('_').map(Number);

        // 2. 密集防止制約：周囲3チャンク以内にすでにDoorが生成されているかチェック
        const radius = 3;
        for (let x = cx - radius; x <= cx + radius; x++) {
            for (let z = cz - radius; z <= cz + radius; z++) {
                const targetKey = `${x}_${z}`;
                if (this.doorHistory.has(targetKey)) {
                    console.log(`Door生成スキップ: 周囲3チャンク以内に既存のDoorがあります (${targetKey})`);
                    return null; // 制約に引っかかったため生成しない
                }
            }
        }

        // 3. 現在のレベル設定から、重みに基づいて次の接続先を抽選
        const currentLevel = this.levelRegistry[this.currentLevelId];
        const nextTargetId = this.selectNextExit(currentLevel.exits);

        // Doorの配置座標を決定（チャンクの中心付近をベースに、少しランダム性を加えるなど）
        const doorPosition = chunkCenterPosition.clone();
        doorPosition.y = 0; // 地面に接地

        const doorData = {
            id: `door_${chunkKey}_${Date.now()}`,
            position: { x: doorPosition.x, y: doorPosition.y, z: doorPosition.z },
            fromLevel: this.currentLevelId,
            toLevel: nextTargetId
        };

        // 4. 【MMO拡張性の担保】生成された情報を履歴（および将来のサーバー同期用）に保存
        this.registerDoorToServer(chunkKey, doorData);

        return doorData;
    }

    /**
     * 重み付きランダムによる次のレベルの抽選
     */
    selectNextExit(exits) {
        const totalWeight = exits.reduce((sum, exit) => sum + exit.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const exit of exits) {
            if (random < exit.weight) {
                return exit.targetId;
            }
            random -= exit.weight;
        }
        return exits[0].targetId;
    }

    /**
     * 【マルチプレイ（MMO）への布石】
     * 生成されたDoorの情報をサーバー側（またはローカルメモリ）に同期・保存する関数。
     * 将来的にこの関数内を WebSocket や Fetch API (POST) に差し替えるだけで、
     * 全プレイヤーで同じ座標に同じ出口が同期されるようになります。
     */
    registerDoorToServer(chunkKey, doorData) {
        // メモリ上に保存
        this.doorHistory.set(chunkKey, doorData);
        
        // TODO: MMO化の際はここを有効化
        /*
        fetch('/api/sync/door', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunkKey, doorData })
        }).catch(err => console.log("サーバー同期オフライン"));
        */
        
        console.log(`[Server Sync] Door登録完了: チャンク[${chunkKey}] -> 接続先: ${doorData.toLevel}`);
    }

    /**
     * プレイヤーがDoorに接触した際に呼び出される遷移関数
     * @param {string} toLevelId 
     */
    async travelToLevel(toLevelId) {
        this.ui.showLoadingOverlay();
        await this.loadLevel(toLevelId);
        this.ui.hideLoadingOverlay();
    }

    /**
     * プレイヤーの周辺座標を監視し、チャンクを無限に生成・更新するロジック（ベース）
     */
    updateChunks() {
        // 本来はプレイヤーの座標を取得してループ処理を行う
        // 例: プレイヤーの周囲5x5チャンクを走査し、未生成なら evaluateDoorGeneration を呼ぶ
    }

    /**
     * レベル切り替え時のクリーンアップ処理
     */
    clearCurrentLevel() {
        // シネマティック効果や既存の環境メッシュ、敵、アイテムの破棄
        this.activeChunks.clear();
        // シーン上の全メッシュのうち、プレイヤー以外の静的オブジェクトをリセット
        if (this.scene) {
            const meshesToDestroy = this.scene.meshes.filter(m => m.name !== "player");
            meshesToDestroy.forEach(m => m.dispose());
        }
    }

    /**
     * レベルファイルがまだない場合の仮の環境生成（テスト用プレースホルダー）
     */
    generateBaseEnvironmentPlaceholder(levelId) {
        // 最低限の床とライトを配置
        const light = new BABYLON.HemisphericLight("ambientLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.5;

        const ground = BABYLON.MeshBuilder.CreateGround("fallbackGround", { width: 50, height: 50 }, this.scene);
        const material = new BABYLON.StandardMaterial("floorMat", this.scene);
        
        // レベルごとの簡易色分け
        if (levelId === "level0") material.diffuseColor = new BABYLON.Color3(0.7, 0.6, 0.3); // 黄色系
        else if (levelId === "manila-room") material.diffuseColor = new BABYLON.Color3(0.5, 0.4, 0.3); // マニラ紙色
        else if (levelId === "level1") material.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3); // コンクリート風グレー
        else if (levelId === "level-1") material.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.2); // 暗い青
        
        ground.material = material;
        
        // 物理アグリゲートの適用 (AABB当たり判定のベース)
        new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene);
    }
}
