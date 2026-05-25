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
        
        // 物理エンジンの有効化（プラグインが存在する場合のみ適用してフリーズを防ぐ）
        if (this.physicsPlugin) {
            const gravityVector = new BABYLON.Vector3(0, -9.81, 0);
            this.scene.enablePhysics(gravityVector, this.physicsPlugin);
        }

        // UIの初期セットアップ
        if (this.ui && typeof this.ui.init === 'function') {
            this.ui.init(this);
        }

        // 最初のレベルの読み込み
        await this.loadLevel(this.currentLevelId);

        // メインレンダーループの開始
        this.engine.runRenderLoop(() => {
            if (this.scene) {
                this.scene.render();
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
        if (this.ui && typeof this.ui.showLevelNotification === 'function') {
            this.ui.showLevelNotification(levelData.name, levelData.type);
        }

        // 【関心の分離】動的なレベルファイルの読み込みと環境構築
        try {
            let levelModulePath = `./levels/${levelId}.js`;
            if (levelData.type === "minus") levelModulePath = `./minus-levels/${levelId}.js`;
            if (levelData.type === "sub") levelModulePath = `./sub-levels/${levelId}.js`;

            // 動的インポートを試みる。ファイルが未作成やエラーならfallbackへ移行
            const levelModule = await import(levelModulePath).catch(() => null);
            if (levelModule && typeof levelModule.generateEnvironment === 'function') {
                levelModule.generateEnvironment(this.scene, this);
            } else {
                this.generateBaseEnvironmentPlaceholder(levelId);
            }
        } catch (error) {
            console.warn(`固有レベルファイルの実行エラーのため、プレースホルダーを生成します: ${error.message}`);
            this.generateBaseEnvironmentPlaceholder(levelId);
        }

        // 各種マネージャーへ通知（オプショナルチェイニングで安全化）
        this.items?.onLevelChanged?.(levelId);
        this.entity?.onLevelChanged?.(levelId);
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
     * 生成されたDoorの情報をサーバー側に同期・保存する関数
     */
    registerDoorToServer(chunkKey, doorData) {
        this.doorHistory.set(chunkKey, doorData);
        console.log(`[Server Sync] Door登録完了: チャンク[${chunkKey}] -> 接続先: ${doorData.toLevel}`);
    }

    /**
     * プレイヤーがDoorに接触した際に呼び出される遷移関数
     * @param {string} toLevelId 
     */
    async travelToLevel(toLevelId) {
        if (this.ui && typeof this.ui.showLoadingOverlay === 'function') this.ui.showLoadingOverlay();
        await this.loadLevel(toLevelId);
        if (this.ui && typeof this.ui.hideLoadingOverlay === 'function') this.ui.hideLoadingOverlay();
    }

    /**
     * プレイヤーの周辺座標を監視し、チャンクを無限に生成・更新するロジック（ベース）
     */
    updateChunks() {
        // 今後プレイヤーの位置座標連動をここに記述
    }

    /**
     * レベル切り替え時のクリーンアップ処理
     */
    clearCurrentLevel() {
        this.activeChunks.clear();
        if (this.scene) {
            const meshesToDestroy = this.scene.meshes.filter(m => m.name !== "player");
            meshesToDestroy.forEach(m => m.dispose());
        }
    }

    /**
     * レベルファイルがまだ無い、あるいは読み込みエラー時の仮環境生成（プレースホルダー）
     */
    generateBaseEnvironmentPlaceholder(levelId) {
        const light = new BABYLON.HemisphericLight("ambientLight", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.5;

        const ground = BABYLON.MeshBuilder.CreateGround("fallbackGround", { width: 50, height: 50 }, this.scene);
        const material = new BABYLON.StandardMaterial("floorMat", this.scene);
        
        if (levelId === "level0") material.diffuseColor = new BABYLON.Color3(0.7, 0.6, 0.3); 
        else if (levelId === "manila-room") material.diffuseColor = new BABYLON.Color3(0.5, 0.4, 0.3); 
        else if (levelId === "level1") material.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3); 
        else if (levelId === "level-1") material.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.2); 
        
        ground.material = material;
        
        if (this.scene.physicsEnabled && this.physicsPlugin) {
            new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }
}
