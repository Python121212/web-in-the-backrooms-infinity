// levels/level0.js - Level 0固有の環境データとアルゴリズム

function seededRandom(x, z, seed = 555) {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453123;
    return h - Math.floor(h);
}

export const Level0 = {
    id: 0,
    name: "The Lobby",
    wallTexture: "./Texture/level0/level0wall.png",
    ceilingTexture: "./Texture/level0/level0ceiling.png",
    
    // バックルームの少し不気味な黄ばんだ光のRGB
    ambientColor: new BABYLON.Color3(0.6, 0.58, 0.42),
    fogDensity: 0.02,

    // チャンク内の指定されたマス(x, z)に壁を置くかどうかの判定アルゴリズム
    generatePattern: function(cx, cz, x, z, gridSize) {
        // 外周の壁（チャンクの境界）は繋がるように空けておく
        if (x === 0 || x === gridSize - 1 || z === 0 || z === gridSize - 1) {
            return false;
        }

        // 擬似乱数を用いて、バックルーム独特の「細長い部屋」や「不規則な突起」を再現
        const blockSeed = seededRandom(cx * 100 + x, cz * 100 + z, 123);
        const roomSeed = seededRandom(cx, cz, 999);

        // 基本的に20%の確率で壁を配置するが、連続性を持たせる簡易ロジック
        if (blockSeed < 0.22) {
            // 一部をくり抜いて通路を作る
            if ((x + z) % 5 === 0 && roomSeed > 0.5) return false;
            return true;
        }

        return false;
    }
};
