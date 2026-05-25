/**
 * ui.js
 * UI全般の描画・スタミナ制御・インベントリ・VHSオーバーレイ管理
 * * 【プログラミング原則】
 * 1. 独立性：DOM操作とスタミナの数値計算をここに集約。
 * 2. マルチプレイ（MMO）への布石：追跡フラグ (isChased) を外部APIやentity.jsからいつでも書き換え・同期可能な設計。
 */

export class UIManager {
    constructor() {
        this.game = null;
        
        // スタミナ関連パラメーター
        this.maxStamina = 100;     // 最大スタミナ
        this.stamina = 100;        // 現在のスタミナ
        this.dashDuration = 10;    // 通常時の最大ダッシュ時間 (10秒)
        this.isDashing = false;
        this.isChased = false;     // エンティティからの追跡フラグ（trueでスタミナ無限化）
        
        // インベントリ関連（最大9個）
        this.inventory = new Array(9).fill(null);
        this.selectedSlot = 0;

        // UIのDOM要素保持用
        this.elements = {};
    }

    /**
     * UIの初期化とDOM要素の動的生成
     * @param {GameManager} gameManager 
     */
    init(gameManager) {
        this.game = gameManager;
        const container = document.getElementById('uiContainer');
        if (!container) return;

        // 1. VHS風レトロエフェクト用テキストの追加
        const vhsOverlay = document.createElement('div');
        vhsOverlay.id = 'vhsOverlay';
        vhsOverlay.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            color: #ebebeb; font-family: 'Courier New', monospace; font-size: 18px;
            text-shadow: 1px 1px 3px rgba(0,0,0,0.8); z-index: 15; pointer-events: none;
        `;
        vhsOverlay.innerHTML = `
            <div style="position: absolute; top: 20px; left: 30px; font-weight: bold; color: #ff3333; animation: blink 1s infinite;">● REC</div>
            <div id="vhsTime" style="position: absolute; bottom: 30px; left: 30px;">00:00:00</div>
            <div style="position: absolute; top: 20px; right: 30px;">SP</div>
            <div style="position: absolute; bottom: 30px; right: 30px;">[▰▰▰▰▱] 85%</div>
        `;
        container.appendChild(vhsOverlay);

        // 点滅アニメーションのスタイルを追加
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            .slot.active { border-color: #d4af37 !important; background: rgba(212, 175, 55, 0.2) !important; }
        `;
        document.head.appendChild(style);

        // 2. スタミナバーの生成
        const staminaWrapper = document.createElement('div');
        staminaWrapper.style.cssText = 'position: absolute; bottom: 110px; left: 50%; transform: translateX(-50%); width: 200px; height: 8px; background: rgba(0,0,0,0.5); border: 1px solid #555; z-index: 20;';
        
        const staminaBar = document.createElement('div');
        staminaBar.id = 'staminaBar';
        staminaBar.style.cssText = 'width: 100%; height: 100%; background: #00ffcc; transition: width 0.1s linear, background-color 0.3s;';
        staminaWrapper.appendChild(staminaBar);
        container.appendChild(staminaWrapper);
        this.elements.staminaBar = staminaBar;

        // 3. インベントリ（9スロット）の生成
        const invContainer = document.createElement('div');
        invContainer.id = 'inventory';
        invContainer.style.cssText = 'position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 20; pointer-events: auto;';
        
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div');
            slot.className = `slot ${i === 0 ? 'active' : ''}`;
            slot.style.cssText = 'width: 50px; height: 50px; background: rgba(0,0,0,0.6); border: 2px solid #555; display: flex; justify-content: center; align-items: center; color: #fff; font-size: 12px; position: relative;';
            
            // スロット番号の表示
            const num = document.createElement('span');
            num.innerText = i + 1;
            num.style.cssText = 'position: absolute; top: 2px; left: 4px; font-size: 9px; color: #aaa;';
            slot.appendChild(num);

            // アイテム画像・テキスト用
            const content = document.createElement('span');
            content.id = `slot-content-${i}`;
            slot.appendChild(content);

            invContainer.appendChild(slot);
        }
        container.appendChild(invContainer);

        // 4. 通知用オーバーレイ
        const notification = document.createElement('div');
        notification.id = 'levelNotification';
        notification.style.cssText = 'position: absolute; top: 35%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #ffeedd; font-size: 28px; letter-spacing: 5px; opacity: 0; transition: opacity 1s ease; z-index: 30; pointer-events: none;';
        container.appendChild(notification);
        this.elements.notification = notification;

        // ロード用の黒幕マスク
        const mask = document.createElement('div');
        mask.id = 'loadingMask';
        mask.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000; opacity: 0; transition: opacity 0.4s ease; z-index: 90; pointer-events: none;';
        container.appendChild(mask);
        this.elements.mask = mask;

        // タイマー更新の開始
        this.startVHSTimer();
        
        // 入力イベントリスナーの登録（スロット切り替え用）
        this.registerInputListeners();
    }

    /**
     * スタミナの毎フレーム計算ロジック
     * プレイヤーの移動処理ループ（あるいはBabylonのBeforeRender）内から毎フレーム呼び出す
     * @param {number} deltaTime 秒単位の経過時間（例: 1/60 ≒ 0.016）
     */
    updateStamina(deltaTime) {
        // 通常時のダッシュ消費レート（10秒で100消費 = 1秒に10消費）
        const depletionRate = this.maxStamina / this.dashDuration; 
        const recoveryRate = 15; // 1秒間に15回復

        if (this.isDashing) {
            // 【最重要要件】エンティティに追跡されている最中はスタミナが減らない（無限ダッシュ）
            if (this.isChased) {
                this.stamina = this.maxStamina; // スタミナを最大値で固定維持
                this.elements.staminaBar.style.backgroundColor = "#ff3333"; // 追跡時はバーを警告赤に
            } else {
                // 通常時のダッシュ消費
                this.stamina = Math.max(0, this.stamina - depletionRate * deltaTime);
                this.elements.staminaBar.style.backgroundColor = "#00ffcc";
            }
        } else {
            // 非ダッシュ時はスタミナが徐々に回復
            this.stamina = Math.min(this.maxStamina, this.stamina + recoveryRate * deltaTime);
            if (!this.isChased) this.elements.staminaBar.style.backgroundColor = "#00ffcc";
        }

        // UIバーの幅に反映
        const percentage = (this.stamina / this.maxStamina) * 100;
        this.elements.staminaBar.style.width = `${percentage}%`;
    }

    /**
     * エンティティの追跡状態をセットする（外部・entity.jsから叩かれる）
     * @param {boolean} chased 
     */
    setChasedStatus(chased) {
        this.isChased = chased;
        console.log(`[Stamina Sync] 追跡フラグ変更: ${chased} (スタミナ無限化: ${chased})`);
    }

    /**
     * アイテムのインベントリへの追加（最大9個）
     * @param {string} itemName アイテム名
     * @return {boolean} 拾得に成功したか
     */
    addItem(itemName) {
        const emptySlotIndex = this.inventory.findIndex(item => item === null);
        if (emptySlotIndex !== -1) {
            this.inventory[emptySlotIndex] = itemName;
            this.updateInventoryUI();
            return true;
        }
        console.log("インベントリが満杯です（最大9個）");
        return false;
    }

    /**
     * インベントリUIの同期更新
     */
    updateInventoryUI() {
        for (let i = 0; i < 9; i++) {
            const content = document.getElementById(`slot-content-${i}`);
            if (content) {
                content.innerText = this.inventory[i] ? this.inventory[i] : "";
            }
        }
    }

    /**
     * 新しいレベルに突入した際の不気味なテキスト通知
     */
    showLevelNotification(name, type) {
        let displayType = "NORMAL LEVEL";
        if (type === "minus") displayType = "MINUS LEVEL";
        if (type === "sub") displayType = "SUB LEVEL";

        this.elements.notification.innerHTML = `
            <div style="font-size: 14px; color: #888; margin-bottom: 5px;">${displayType}</div>
            <div style="font-weight: bold; text-transform: uppercase;">${name}</div>
        `;
        
        this.elements.notification.style.opacity = 1;
        
        setTimeout(() => {
            this.elements.notification.style.opacity = 0;
        }, 4000); // 4秒後にフェードアウト
    }

    /**
     * レベル遷移時のロード画面演出（フェードイン・アウト）
     */
    showLoadingOverlay() { this.elements.mask.style.opacity = 1; }
    hideLoadingOverlay() { this.elements.mask.style.opacity = 0; }

    /**
     * VHSのタイムコード風タイマーをインクリメント
     */
    startVHSTimer() {
        let totalSeconds = 0;
        setInterval(() => {
            totalSeconds++;
            const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const secs = String(totalSeconds % 60).padStart(2, '0');
            
            const timeElement = document.getElementById('vhsTime');
            if (timeElement) timeElement.innerText = `${hrs}:${mins}:${secs}`;
        }, 1000);
    }

    /**
     * キーボードの1~9キーでインベントリスロットを選択するリスナー
     */
    registerInputListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '9') {
                const index = parseInt(e.key) - 1;
                
                // アクティブなスロット表示の切り替え
                const slots = document.querySelectorAll('#inventory .slot');
                slots[this.selectedSlot].classList.remove('active');
                
                this.selectedSlot = index;
                slots[this.selectedSlot].classList.add('active');
                
                console.log(`スロット ${e.key} が選択されました:`, this.inventory[this.selectedSlot]);
            }
        });
    }
}
