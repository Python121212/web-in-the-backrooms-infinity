/**
 * levels/level0.js
 * レベル0「The Lobby」の固有環境生成ロジック
 * * 【プログラミング原則】
 * 1. 関心の分離：蛍光灯の配置、テクスチャ、軽量化シャドウの設定など、環境構築はすべてこのファイル内で完結させる。
 */

export function generateEnvironment(scene, gameManager) {
    console.log("level0: 固有環境の生成を開始します。");

    // 1. 環境光・ベースライトの設定（薄暗く不気味な黄色を演出）
    const ambientLight = new BABYLON.HemisphericLight("level0_ambient", new BABYLON.Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.2;
    ambientLight.diffuse = new BABYLON.Color3(0.8, 0.75, 0.5);

    // 2. マテリアルのロードとテクスチャの適用
    const wallMaterial = new BABYLON.StandardMaterial("level0_wall_mat", scene);
    wallMaterial.diffuseTexture = new BABYLON.Texture("./Texture/level0/level0wall.png", scene);
    // 壁紙のスケール微調整（リピート処理）
    wallMaterial.diffuseTexture.uScale = 2.0;
    wallMaterial.diffuseTexture.vScale = 2.0;

    const floorMaterial = new BABYLON.StandardMaterial("level0_floor_mat", scene);
    floorMaterial.diffuseTexture = new BABYLON.Texture("./Texture/level0/level0floor.png", scene);

    const ceilingMaterial = new BABYLON.StandardMaterial("level0_ceiling_mat", scene);
    ceilingMaterial.diffuseTexture = new BABYLON.Texture("./Texture/level0/level0ceiling.png", scene);

    // 3. 基本となる無限風構造（テスト用ベースチャンク）の構築
    const chunkSize = 30;
    
    // 床の生成
    const floor = BABYLON.MeshBuilder.CreateGround("level0_floor", { width: chunkSize, height: chunkSize }, scene);
    floor.material = floorMaterial;
    new BABYLON.PhysicsAggregate(floor, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

    // 天井の生成
    const ceiling = BABYLON.MeshBuilder.CreatePlane("level0_ceiling", { width: chunkSize, height: chunkSize }, scene);
    ceiling.position.y = 4.0; // 天井の高さ
    ceiling.rotation.x = Math.PI / 2; // 下を向かせる
    ceiling.material = ceilingMaterial;

    // 4. 【最重要要件】軽量化シャドウ（ShadowGenerator）の設定
    // プレイヤーなどの動的オブジェクト用にシャドウマップを用意するが、静的環境は1度だけ描画して負荷を劇的に削減
    const shadowLight = new BABYLON.DirectionalLight("level0_shadow_light", new BABYLON.Vector3(-1, -2, -1), scene);
    shadowLight.position = new BABYLON.Vector3(10, 20, 10);
    shadowLight.intensity = 0.4;

    const shadowGenerator = new BABYLON.ShadowGenerator(1024, shadowLight);
    // 負荷軽減のため、静的オブジェクトの影は以下の設定で描画を最適化する。
    shadowGenerator.getShadowMap().refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;

    // 5. 【固有配置】蛍光灯（灯具と光源）の配置ロジック
    // 一定間隔で天井に蛍光灯メッシュとスポットライトを配置
    const lightPositions = [
        new BABYLON.Vector3(-5, 3.9, -5),
        new BABYLON.Vector3(5, 3.9, -5),
        new BABYLON.Vector3(-5, 3.9, 5),
        new BABYLON.Vector3(5, 3.9, 5)
    ];

    lightPositions.forEach((pos, index) => {
        // 蛍光灯の見た目（白い細長いボックス）
        const flBox = BABYLON.MeshBuilder.CreateBox(`fluorescent_${index}`, { width: 0.4, height: 0.05, depth: 2.0 }, scene);
        flBox.position = pos;
        
        const flMat = new BABYLON.StandardMaterial(`fl_mat_${index}`, scene);
        flMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.7); // 自発光して光っているように見せる
        flBox.material = flMat;

        // 実際の光源（直下の床を照らすポイントライト）
        const pointLight = new BABYLON.PointLight(`fl_light_${index}`, pos.add(new BABYLON.Vector3(0, -0.2, 0)), scene);
        pointLight.intensity = 0.3;
        pointLight.diffuse = new BABYLON.Color3(0.95, 0.95, 0.8);
        
        // 静的な影の対象として床などをキャッチさせる
        shadowGenerator.addShadowCaster(flBox);
    });

    // 床と壁（この後追加する壁メッシュ）は影を受ける
    floor.receiveShadows = true;

    // BGM・環境音（蛍光灯のブーンというハミング音）の再生
    const buzzSound = new BABYLON.Sound("level0_buzz", "./level sound/level0/level0.mp3", scene, null, {
        loop: true,
        autoplay: true,
        volume: 0.5
    });

    // 6. 出口のドア生成チェックの呼び出し（map.js側のアルゴリズムと連携）
    // 例として、現在の中心座標に確率が通ればDoorモデルをスポーンさせる
    const chunkKey = "0_0";
    const doorData = gameManager.evaluateDoorGeneration(chunkKey, new BABYLON.Vector3(0, 0, 8));
    
    if (doorData) {
        spawnExitDoor(scene, doorData, gameManager);
    }
}

/**
 * 出口ドアの3Dモデルスポーンと接触トリガーの設定
 */
function spawnExitDoor(scene, doorData, gameManager) {
    // 汎用モデルフォルダからDoor.glbを読み込む
    BABYLON.SceneLoader.ImportMesh("", "./model/", "Door.glb", scene, function (meshes) {
        const rootMesh = meshes[0];
        rootMesh.name = doorData.id;
        rootMesh.position = new BABYLON.Vector3(doorData.position.x, doorData.position.y, doorData.position.z);
        
        console.log(`[Asset Spawn] 出口ドアを生成しました。接続先: ${doorData.toLevel}`);

        // プレイヤーとの衝突・接近検知用の見えないトリガーボックス
        const trigger = BABYLON.MeshBuilder.CreateBox(`trigger_${doorData.id}`, { size: 2 }, scene);
        trigger.position = rootMesh.position.clone();
        trigger.visibility = 0; // 不可視

        // アクションマネージャーで接触イベントを登録
        trigger.actionManager = new BABYLON.ActionManager(scene);
        
        // 実際の実装では、ここに「プレイヤーがトリガーに入ったら」の判定を入れます
        // 例: gameManager.travelToLevel(doorData.toLevel);
    });
}
