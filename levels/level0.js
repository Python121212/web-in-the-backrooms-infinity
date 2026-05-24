// levels/level0.js - 暗い黄色テクスチャ調に最適化した設定

function seededRandom(x, z, seed = 555) {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453123;
    return h - Math.floor(h);
}

export const Level0 = {
    id: 0,
    name: "The Lobby",
    wallTexture: "./Texture/level0/level0wall.png",
    ceilingTexture: "./Texture/level0/level0ceiling.png",
    
    materialSettings: {
        wall: {
            // 暗い黄色を強調するため、マテリアル側で少し色度を落とす
            diffuseColor: new BABYLON.Color3(0.75, 0.73, 0.52), 
            specularColor: new BABYLON.Color3(0.02, 0.02, 0.02),
            specularPower: 1,
            uScale: 1.5, // 模様が引き伸ばされないように比率調整
            vScale: 1.0
        }
    },

    // 蛍光灯の光を落とした暗い環境光
    ambientColor: new BABYLON.Color3(0.45, 0.43, 0.28), 
    
    // 遠くがどんよりと霞む、不気味で暗い黄土色の霧
    fogColor: new BABYLON.Color3(0.32, 0.30, 0.18),
    fogDensity: 0.035, // 霧を少し濃くして先を見えにくく変更

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
