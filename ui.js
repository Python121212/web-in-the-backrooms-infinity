// ui.js - 画面表示、モバイル操作UI、およびプレイヤー状態のインジケータ管理

export class UIManager {
    constructor(playerStateCallbacks) {
        // プレイヤーの行動状態（走る、リーンなど）をindex.html側から取得・変更するためのコールバック
        this.playerState = playerStateCallbacks;
        
        this.isMobile = this.detectMobile();
        this.initCSS();
        this.createUI();
        this.bindEvents();
    }

    // モバイル端末（スマホ・タブレット）の判定
    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // UIに必要なスタイルの自動注入（CSSファイルを分けないことで読み込みを高速化・軽量化）
    initCSS() {
        const style = document.createElement('style');
        style.textContent = `
            /* 全体コンテナ */
            #game-ui-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                font-family: 'Courier New', Courier, monospace;
                user-select: none;
            }
            .interactive { pointer-events: auto; }

            /* レティクル（画面中央の照準点） */
            #reticle {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 4px;
                height: 4px;
                background-color: rgba(255, 255, 255, 0.5);
                border-radius: 50%;
                transform: translate(-50%, -50%);
            }

            /* ステータスインジケータ（画面左下：走る/リーンなどの状態） */
            #status-display {
                position: absolute;
                bottom: 20px;
                left: 20px;
                color: #8a854a;
                font-size: 14px;
                line-height: 1.5;
                text-shadow: 1px 1px 2px #000;
            }
            .status-active { color: #fff; font-weight: bold; text-shadow: 0 0 5px #fff; }

            /* モバイル用バーチャルパッド・ボタン（画面下部・左右） */
            .mobile-btn {
                position: absolute;
                width: 60px;
                height: 60px;
                background: rgba(0, 0, 0, 0.4);
                border: 2px solid #8a854a;
                border-radius: 50%;
                color: #8a854a;
                font-size: 12px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: none;
            }
            .mobile-btn:active {
                background: rgba(138, 133, 74, 0.4);
                color: #fff;
            }
            #btn-jump { bottom: 100px; right: 30px; }
            #btn-sprint { bottom: 30px; right: 110px; }
            #btn-lean-l { bottom: 30px; left: 30px; border-radius: 10px; }
            #btn-lean-r { bottom: 30px; left: 110px; border-radius: 10px; }
        `;
        document.head.appendChild(style);
    }

    // HTML要素の動的生成
    createUI() {
        const container = document.createElement('div');
        container.id = 'game-ui-container';

        // 1. 画面中央の点（探索系ゲームに必須のレティクル）
        if (!this.isMobile) {
            const reticle = document.createElement('div');
            reticle.id = 'reticle';
            container.appendChild(reticle);
        }

        // 2. プレイヤーの状態インジケータ
        const statusDisplay = document.createElement('div');
        statusDisplay.id = 'status-display';
        statusDisplay.innerHTML = `
            STAMINA: <span id="ui-stamina">100%</span><br>
            STATE: <span id="state-normal" class="status-active">NORMAL</span> 
                   <span id="state-sprint">SPRINT</span><br>
            LEAN: <span id="state-lean-l">LEFT</span> / <span id="state-lean-n" class="status-active">NONE</span> / <span id="state-lean-r">RIGHT</span>
        `;
        container.appendChild(statusDisplay);

        // 3. モバイル端末時のみ、操作用ボタン一式を生成（PC時は非表示で超軽量）
        if (this.isMobile) {
            const btnJump = this.makeButton('btn-jump', 'JUMP');
            const btnSprint = this.makeButton('btn-sprint', 'RUN');
            const btnLeanL = this.makeButton('btn-lean-l', 'LEAN L');
            const btnLeanR = this.makeButton('btn-lean-r', 'LEAN R');

            container.appendChild(btnJump);
            container.appendChild(btnSprint);
            container.appendChild(btnLeanL);
            container.appendChild(btnLeanR);
        }

        document.body.appendChild(container);
    }

    makeButton(id, text) {
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = 'mobile-btn interactive';
        btn.innerText = text;
        return btn;
    }

    // 各種ボタンやキーボードと連動したUI表示更新イベントの登録
    bindEvents() {
        if (this.isMobile) {
            // --- モバイル用タッチイベント ---
            
            // ジャンプボタン（タップした瞬間）
            document.getElementById('btn-jump').addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.playerState.onJump) this.playerState.onJump();
            });

            // ダッシュボタン（押しっぱなしで走る）
            const sprintBtn = document.getElementById('btn-sprint');
            sprintBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.setSprintUI(true);
                if (this.playerState.onSprint) this.playerState.onSprint(true);
            });
            sprintBtn.addEventListener('touchend', () => {
                this.setSprintUI(false);
                if (this.playerState.onSprint) this.playerState.onSprint(false);
            });

            // リーン左ボタン
            const leanLBtn = document.getElementById('btn-lean-l');
            leanLBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.setLeanUI('left');
                if (this.playerState.onLean) this.playerState.onLean('left');
            });
            leanLBtn.addEventListener('touchend', () => {
                this.setLeanUI('none');
                if (this.playerState.onLean) this.playerState.onLean('none');
            });

            // リーン右ボタン
            const leanRBtn = document.getElementById('btn-lean-r');
            leanRBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.setLeanUI('right');
                if (this.playerState.onLean) this.playerState.onLean('right');
            });
            leanRBtn.addEventListener('touchend', () => {
                this.setLeanUI('none');
                if (this.playerState.onLean) this.playerState.onLean('none');
            });

        } else {
            // --- PC用キーボード連動イベント（表示の同期用） ---
            window.addEventListener('keydown', (e) => {
                if (e.shiftKey) this.setSprintUI(true);
                if (e.key.toLowerCase() === 'q') this.setLeanUI('left');
                if (e.key.toLowerCase() === 'e') this.setLeanUI('right');
            });

            window.addEventListener('keyup', (e) => {
                if (e.key === 'Shift') this.setSprintUI(false);
                if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') this.setLeanUI('none');
            });
        }
    }

    // 走る状態のUIクラス切り替え
    setSprintUI(isSprinting) {
        const normal = document.getElementById('state-normal');
        const sprint = document.getElementById('state-sprint');
        if (isSprinting) {
            normal.className = '';
            sprint.className = 'status-active';
        } else {
            normal.className = 'status-active';
            sprint.className = '';
        }
    }

    // リーン状態のUIクラス切り替え
    setLeanUI(direction) {
        document.getElementById('state-lean-l').className = direction === 'left' ? 'status-active' : '';
        document.getElementById('state-lean-n').className = direction === 'none' ? 'status-active' : '';
        document.getElementById('state-lean-r').className = direction === 'right' ? 'status-active' : '';
    }

    // スタミナバーなどの数値を外部（メインループ）からリアルタイム更新する用
    updateStamina(value) {
        const staminaEl = document.getElementById('ui-stamina');
        if (staminaEl) {
            staminaEl.innerText = `${Math.max(0, Math.min(100, Math.floor(value)))}%`;
            if (value < 20) {
                staminaEl.style.color = '#ff0000'; // スタミナが減ると赤字に
            } else {
                staminaEl.style.color = '#8a854a';
            }
        }
    }
}
