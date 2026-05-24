// levels/level0.js

export const Level0 = {
    id: 0,
    name: "The Lobby",
    wallTexture: "Texture/level0/level0wall.png", // 【修正】元の正しいパスに変更
    ceilingTexture: "./Texture/level0/level0ceiling.png",
    
    materialSettings: {
        wall: {
            diffuseColor: new BABYLON.Color3(0.65, 0.62, 0.45), 
            specularColor: new BABYLON.Color3(0.01, 0.01, 0.01),
            uScale: 2.0
        }
    },

    ambientColor: new BABYLON.Color3(0.18, 0.16, 0.10), // 光と影を引き立たせるための暗い環境光
    fogColor: new BABYLON.Color3(0.20, 0.18, 0.10),
    fogDensity: 0.045,

    generatePattern: function(cx, cz, x, z, gridSize) {
        if (x === 0 || x === gridSize - 1 || z === 0 || z === gridSize - 1) return false;
        const blockSeed = Math.sin(x * 12.98 + z * 78.23 + (cx * 55 + cz)) * 43758.54;
        return (blockSeed - Math.floor(blockSeed)) < 0.22;
    }
};
