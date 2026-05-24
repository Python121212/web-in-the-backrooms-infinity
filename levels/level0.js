// levels/level0.js

export const Level0 = {
    id: 0,
    name: "The Lobby",
    wallTexture: "./Texture/level0/level0wall.png",
    ceilingTexture: "./Texture/level0/level0ceiling.png",
    
    materialSettings: {
        wall: {
            diffuseColor: new BABYLON.Color3(0.65, 0.62, 0.45), 
            specularColor: new BABYLON.Color3(0.01, 0.01, 0.01)
        }
    },

    // 蛍光灯による環境光（湿った陰気な黄色）
    ambientColor: new BABYLON.Color3(0.38, 0.35, 0.22), 
    
    // 遠くの壁を完全に隠す深い霧の設定
    fogColor: new BABYLON.Color3(0.24, 0.22, 0.12),
    fogDensity: 0.045, // 生成限界の手前で視界を遮断するように濃く設定

    generatePattern: function(cx, cz, x, z, gridSize) {
        if (x === 0 || x === gridSize - 1 || z === 0 || z === gridSize - 1) return false;
        const blockSeed = Math.sin(x * 12.98 + z * 78.23 + (cx * 55 + cz)) * 43758.54;
        return (blockSeed - Math.floor(blockSeed)) < 0.22;
    }
};
