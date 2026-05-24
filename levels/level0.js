// levels/level0.js

export const Level0 = {
    id: 0,
    name: "The Lobby",
    wallTexture: "./4854.png", // 【変更】アップロードされた新規壁紙画像を指定
    ceilingTexture: "./Texture/level0/level0ceiling.png",
    
    materialSettings: {
        wall: {
            diffuseColor: new BABYLON.Color3(1.0, 1.0, 1.0), // 画像本来の暗い黄色を活かすため白にリセット
            specularColor: new BABYLON.Color3(0.01, 0.01, 0.01)
        }
    },

    ambientColor: new BABYLON.Color3(0.22, 0.20, 0.12), // 影を引き立たせるため環境光を落とす
    fogColor: new BABYLON.Color3(0.18, 0.16, 0.08),
    fogDensity: 0.05, // 霧をさらに濃くして部屋の出現を完全遮断

    generatePattern: function(cx, cz, x, z, gridSize) {
        if (x === 0 || x === gridSize - 1 || z === 0 || z === gridSize - 1) return false;
        const blockSeed = Math.sin(x * 12.98 + z * 78.23 + (cx * 55 + cz)) * 43758.54;
        return (blockSeed - Math.floor(blockSeed)) < 0.22;
    }
};
