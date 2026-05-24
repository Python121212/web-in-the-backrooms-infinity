// levels/level0.js - テクスチャに最適化した設定

function seededRandom(x, z, seed = 555) {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453123;
    return h - Math.floor(h);
}

export const Level0 = {
    id: 0,
    name: "The Lobby",
    wallTexture: "./Texture/level0/level0wall.png", // 更新：ご提供の壁紙
    ceilingTexture: "./Texture/level0/level0ceiling.png", // (天井は前回のまま)
    
    // マテリアルの質感設定 (PBR: 物理ベースレンダリングを見据えて)
    materialSettings: {
        wall: {
            diffuseColor: new BABYLON.Color3(1.0, 1.0, 1.0), // 元の画像の色を活かす
            specularColor: new BABYLON.Color3(0.05, 0.05, 0.05), // 湿った質感で、ツヤはほぼなし
            specularPower: 2, // 反射の広がり
            uScale: 1, // 壁1ブロック(3m)に対するテクスチャの繰り返し数 (横)
            vScale: 1  // 壁1ブロック(3m)に対するテクスチャの繰り返し数 (縦)
        }
    },

    // 蛍光灯の光を模した環境光の色 (壁紙の色をより強調する黄色)
    ambientColor: new BABYLON.Color3(0.95, 0.93, 0.75), 
    
    // 遠景の霧の色と濃さ (テクスチャに馴染む黄色い霧)
    fogColor: new BABYLON.Color3(0.85, 0.83, 0.60),
    fogDensity: 0.02,

    // 迷路生成ロジックは変更なし
    generatePattern: function(cx, cz, x, z, gridSize) {
        if (x === 0 || x === gridSize - 1 || z === 0 || z === gridSize - 1) return false;
        const blockSeed = seededRandom(cx * 100 + x, cz * 100 + z, 123);
        const roomSeed = seededRandom(cx, cz, 999);
        if (blockSeed < 0.22) {
            if ((x + z) % 5 === 0 && roomSeed > 0.5) return false;
            return true;
        }
        return false;
    }
};
