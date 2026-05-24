// ui.js - 画面表示、動く仮想スティック、およびプレイヤー状態のインジケータ管理

export class UIManager {
    constructor(playerStateCallbacks) {
        this.playerState = playerStateCallbacks;
        this.isMobile = this.detectMobile();
        
        // 仮想スティックの制御用変数
        this.stickActive = false;
        this.stickStartPos = { x: 0, y: 0 };
        this.stickMoveVector = { x: 0, y: 0 }; // メイン側に渡す移動量（-1 ～ 1）

        this.initCSS();
        this.createUI();
        this.bindEvents();
    }

    detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    initCSS() {
        const style = document.createElement('style');
        style.textContent = `
            #game-ui-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                font-family: 'Courier New', Courier, monospace;
                user-select: none;
                z-index: 20;
            }
            .interactive { pointer-events: auto; }

            /* レティクル */
            #reticle {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 4px;
                height: 4px;
                background-color: rgba(255, 255, 255, 0.4);
                border-radius: 50%;
                transform: translate(-50%, -50%);
            }

            /* ステータス（デバッグと被らないよう、左下より少し上に配置調整） */
            #status-display {
                position: absolute;
                bottom: 180px; /* スティックと被らない高さへ退避 */
                left: 20px;
                color: #5e5a32; /* 暗い黄色系 */
                font-size: 14px;
                line-height: 1.5;
                text-shadow: 1px 1px 2px #000;
            }
            .status-active { color: #d1ca74; font-weight: bold; text-shadow: 0 0 5px rgba(209,202,116,0.5); }

            /* 動く仮想スティックの土台 */
            #joystick-base {
                position: absolute;
                bottom: 30px;
                left: 30px;
                width: 100px;
                height: 100px;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid #5e5a32;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: none;
            }
            /* スティックの動くつまみ */
            #joystick-knob {
                width: 40px;
                height: 40px;
                background: #5e5a32;
                border-radius: 50%;
                transition: transform 0.05s ease;
            }

            /* 右側の操作ボタン群 */
            .mobile-btn {
                position: absolute;
                width: 65px;
                height: 65px;
                background: rgba(0, 0, 0, 0.5);
                border: 2px solid #5e5a32;
                border-radius: 50%;
                color: #5e5a32;
                font-size: 12px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: none;
            }
            .mobile-btn:active {
                background: rgba(94, 90, 50, 0.6);
                color: #fff;
            }
            #btn-jump { bottom: 110px; right: 30px; }
            #btn-sprint { bottom: 30px; right: 30px; }
            #btn-lean-l { bottom: 110px; right: 110px; border-radius: 10px; }
            #btn-lean-r { bottom: 30px; right: 110px; border-radius: 10px; }
        `;
        document.head.appendChild(style);
    }

    createUI() {
        const container = document.createElement('div');
        container.id = 'game-ui-container';

        if (!this.isMobile) {
            const reticle = document.createElement('div');
            reticle.id = 'reticle';
            container.appendChild(reticle);
        }

        const statusDisplay = document.createElement('div');
        statusDisplay.id = 'status-display';
        statusDisplay.innerHTML = `
            STAMINA: <span id="ui-stamina">100%</span><br>
            STATE: <span id="state-normal" class="status-active">NORMAL</span> 
                   <span id="state-sprint">SPRINT</span><br>
            LEAN: <span id="state-lean-l">LEFT</span> / <span id="state-lean-n" class="status-active">NONE</span> / <span id="state-lean-r">RIGHT</span>
        `;
        container.appendChild(statusDisplay);

        if (this.isMobile) {
            // 仮想スティックのHTML生成
            const jsBase = document.createElement('div');
            jsBase.id = 'joystick-base';
            jsBase.className = 'interactive';
            const jsKnob = document.createElement('div');
            jsKnob.id = 'joystick-knob';
            jsBase.appendChild(jsKnob);
            container.appendChild(jsBase);

            // 右側アクションボタン
            container.appendChild(this.makeButton('btn-jump', 'JUMP'));
            container.appendChild(this.makeButton('btn-sprint', 'RUN'));
            container.appendChild(this.makeButton('btn-lean-l', 'LEAN L'));
            container.appendChild(this.makeButton('btn-lean-r', 'LEAN R'));
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

    bindEvents() {
        if (this.isMobile) {
            const base = document.getElementById('joystick-base');
            const knob = document.getElementById('joystick-knob');
            const maxRadius = 40; // つまみが動く最大半径(px)

            // --- 仮想スティックのタッチロジック ---
            base.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.stickActive = true;
                const touch = e.touches[0];
                const rect = base.getBoundingClientRect();
                // スティックの中心点を基準とする
                this.stickStartPos = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            });

            window.addEventListener('touchmove', (e) => {
                if (!this.stickActive) return;
                
                // スティックのタッチを追跡
                let targetTouch = null;
                for (let t of e.touches) {
                    if (t.target.id === 'joystick-base' || t.target.id === 'joystick-knob' || this.stickActive) {
                        targetTouch = t;
                        break;
                    }
                }
                if (!targetTouch) return;

                const dx = targetTouch.clientX - this.stickStartPos.x;
                const dy = targetTouch.clientY - this.stickStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                let angle = Math.atan2(dy, dx);
                let moveX = dx;
                let moveY = dy;

                // 制限半径を超えたら丸める
                if (distance > maxRadius) {
                    moveX = Math.cos(angle) * maxRadius;
                    moveY = Math.sin(angle) * maxRadius;
                }

                // つまみの視覚的移動
                knob.style.transform = `translate(${moveX}px, ${moveY}px)`;

                // メインループに渡す移動ベクトル (-1.0 ～ 1.0) の計算
                this.stickMoveVector.x = moveX / maxRadius;
                this.stickMoveVector.y = -(moveY / maxRadius); // Y軸反転
                
                if (this.playerState.onStickMove) {
                    this.playerState.onStickMove(this.stickMoveVector.x, this.stickMoveVector.y);
                }
            }, { passive: false });

            window.addEventListener('touchend', () => {
                if (!this.stickActive) return;
                this.stickActive = false;
                knob.style.transform = `translate(0px, 0px)`;
                this.stickMoveVector = { x: 0, y: 0 };
                if (this.playerState.onStickMove) {
                    this.playerState.onStickMove(0, 0);
                }
            });

            // --- アクションボタン群 ---
            document.getElementById('btn-jump').addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.playerState.onJump) this.playerState.onJump();
            });

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
            // PC用イベント
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

    setSprintUI(isSprinting) {
        const normal = document.getElementById('state-normal');
        const sprint = document.getElementById('state-sprint');
        if (!normal || !sprint) return;
        if (isSprinting) {
            normal.className = '';
            sprint.className = 'status-active';
        } else {
            normal.className = 'status-active';
            sprint.className = '';
        }
    }

    setLeanUI(direction) {
        const l = document.getElementById('state-lean-l');
        const n = document.getElementById('state-lean-n');
        const r = document.getElementById('state-lean-r');
        if (!l || !n || !r) return;
        l.className = direction === 'left' ? 'status-active' : '';
        n.className = direction === 'none' ? 'status-active' : '';
        r.className = direction === 'right' ? 'status-active' : '';
    }

    updateStamina(value) {
        const staminaEl = document.getElementById('ui-stamina');
        if (staminaEl) {
            staminaEl.innerText = `${Math.max(0, Math.min(100, Math.floor(value)))}%`;
            staminaEl.style.color = value < 20 ? '#ff3333' : (value < 50 ? '#b5a642' : '#d1ca74');
        }
    }
}
