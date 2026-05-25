/**
 * levels/manila-room.js
 * 特殊レベル「The Manila Room」の固有環境生成ロジック
 */

export function generateEnvironment(scene, gameManager) {
    console.log("manila-room: 固有環境の生成を開始します。");

    // 1. 環境光（全体的にくすんだ、光の届かない均一な空間）
    const ambientLight = new BABYLON.HemisphericLight("manila_ambient", new BABYLON.Vector3(0, 1, 0), scene);
    ambientLight.intensity = 0.4;
    ambientLight.diffuse = new BABYLON.Color3(0.5, 0.45, 0.35); // マニラ特有の茶・ベージュ系

    // 2. 床・壁・天井すべてに同じマニラ紙風の単色/微細テクスチャを適用
    const manilaMaterial = new BABYLON.StandardMaterial("manila_mat", scene);
    manilaMaterial.diffuseColor = new BABYLON.Color3(0.54, 0.47, 0.36);

    // 狭い正方形の部屋を構築
    const roomSize = 12;
    const ground = BABYLON.MeshBuilder.CreateGround("manila_floor", { width: roomSize, height: roomSize }, scene);
    ground.material = manilaMaterial;
    new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

    const ceiling = BABYLON.MeshBuilder.CreatePlane("manila_ceiling", { width: roomSize, height: roomSize }, scene);
    ceiling.position.y = 3.0;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.material = manilaMaterial;

    // 3. 部屋の中央にポツンと配置される机などの環境オブジェクト（プレースホルダー）
    const desk = BABYLON.MeshBuilder.CreateBox("manila_desk", { width: 2, height: 1, depth: 1 }, scene);
    desk.position = new BABYLON.Vector3(0, 0.5, 0);
    const deskMat = new BABYLON.StandardMaterial("desk_mat", scene);
    deskMat.diffuseColor = new BABYLON.Color3(0.3, 0.2, 0.1);
    desk.material = deskMat;
    new BABYLON.PhysicsAggregate(desk, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

    // 4. Level 0 に「絶対に戻れる」確定の出口ドアを配置
    // マニラルームの接続先はmap.jsのレジストリ側で「level0」に固定指定されているため、安全に抽選されます
    const chunkKey = "manila_center";
    const doorData = gameManager.evaluateDoorGeneration(chunkKey, new BABYLON.Vector3(0, 0, -4));
    
    if (doorData) {
        // level0.jsと同様の仕組みでDoorをスポーン
        BABYLON.SceneLoader.ImportMesh("", "./model/", "Door.glb", scene, function (meshes) {
            const rootMesh = meshes[0];
            rootMesh.position = new BABYLON.Vector3(doorData.position.x, doorData.position.y, doorData.position.z);
            console.log(`[Manila Room] Level 0 への帰還ドアを生成しました。`);
        });
    }
}
