// ui.js - マルチタッチ対応仮想スティック ＆ 視点移動エリア管理

export class UIManager {
    constructor(playerStateCallbacks) {
        this.playerState = playerStateCallbacks;
        this.isMobile = this.detectMobile();
        
        // スティック用
        this.stickActive = false;
        this.stickTouchId = null;
        this.stickStartPos = { x: 0, y: 0 };
        this.stickMoveVector = { x: 0, y: 0 };

        // 視点移動用
        this.lookTouchId = null;
        this.lastLookPos = { x: 0, y: 0 };

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
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none; font-family: 'Courier New', Courier, monospace;
                user-select: none; z-index: 20;
            }
            .interactive { pointer-events: auto; }

            #reticle {
                position: absolute; top: 50%; left: 50%; width: 4px; height: 4px;
                background-color: rgba(255, 255, 255, 0.4); border-radius: 50%; transform: translate(-50%, -50%);
            }

            #status-display {
                position: absolute; bottom: 150px; left: 20px;
                color: #5e5a32; font-size: 14px; line-height: 1.5; text-shadow: 1px 1px 2px #000;
            }
            .status-active { color: #d1ca74; font-weight: bold; text-shadow: 0 0 5px rgba(209,202,116,0.5); }

            /* 仮想スティック */
            #joystick-base {
                position: absolute; bottom: 30px; left: 30px; width: 90px; height: 90px;
                background: rgba(0, 0, 0, 0.6); border: 2px solid #5e5a32; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; touch-action: none;
            }
            #joystick-knob { width: 35px; height: 35px; background: #5e5a32; border-radius: 50%; }

            /* 視点操作用タッチパッド（左側のスティック領域以外を広くカバー） */
            #mobile-look-touchpad {
                position: absolute; top: 0; right: 0; width: 100%; height: 100%;
                touch-action: none; z-index: 5;
            }

            /* ボタン類（最前面に配置） */
            .mobile-btn {
                position: absolute; width: 60px; height: 60px; background: rgba(0, 0, 0, 0.6);
                border: 2px solid #5e5a32; border-radius: 50%; color: #5e5a32;
                font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center;
                touch-action: none; z-index: 25;
            }
            .mobile-btn:active { background: rgba(94, 90, 50, 0.7); color: #fff; }
            #btn-jump { bottom: 100px; right: 20px; }
            #btn-sprint { bottom: 25px; right: 20px; }
            #btn-lean-l { bottom: 100px; right: 95px; border-radius: 8px; }
            #btn-lean-r { bottom: 25px; right: 95px; border-radius: 8px; }
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
            STATE: <span id="state-normal" class="status-active">NORMAL</span> <span id="state-sprint">SPRINT</span><br>
            LEAN: <span id="state-lean-l">LEFT</span> / <span id="state-lean-n" class="status-active">NONE</span> / <span id="state-lean-r">RIGHT</span>
        `;
        container.appendChild(statusDisplay);

        if (this.isMobile) {
            const lookPad = document.createElement('div');
            lookPad.id = 'mobile-look-touchpad';
            lookPad.className = 'interactive';
            container.appendChild(lookPad);

            const jsBase = document.createElement('div');
            jsBase.id = 'joystick-base';
            jsBase.className = 'interactive';
            const jsKnob = document.createElement('div');
            jsKnob.id = 'joystick-knob';
            jsBase.appendChild(jsKnob);
            container.appendChild(jsBase);

            container.appendChild(this.makeButton('btn-jump', 'JUMP'));
            container.appendChild(this.makeButton('btn-sprint', 'RUN'));
            container.appendChild(this.makeButton('btn-lean-l', 'LEAN L'));
            container.appendChild(this.makeButton('btn-lean-r', 'LEAN R'));
        }

        document.body.appendChild(container);
    }

    makeButton(id, text) {
        const btn = document.createElement('div');
        btn.id = id; btn.className = 'mobile-btn interactive'; btn.innerText = text;
        return btn;
    }

    bindEvents() {
        if (!this.isMobile) {
            // PC用キーバインドのUI同期
            window.addEventListener('keydown', (e) => {
                if (e.shiftKey) this.setSprintUI(true);
                if (e.key.toLowerCase() === 'q') this.setLeanUI('left');
                if (e.key.toLowerCase() === 'e') this.setLeanUI('right');
            });
            window.addEventListener('keyup', (e) => {
                if (e.key === 'Shift') this.setSprintUI(false);
                if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') this.setLeanUI('none');
            });
            return;
        }

        const base = document.getElementById('joystick-base');
        const knob = document.getElementById('joystick-knob');
        const lookPad = document.getElementById('mobile-look-touchpad');
        const maxRadius = 35;

        // --- マルチタッチ完全対応イベント ---
        window.addEventListener('touchstart', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                
                // ボタン類へのタッチはスルー
                if (touch.target.classList.contains('mobile-btn')) continue;

                // 左下領域かつスティックが未作動ならスティックとして処理
                if (!this.stickActive && touch.clientX < window.innerWidth * 0.45 && touch.clientY > window.innerHeight * 0.4) {
                    this.stickActive = true;
                    this.stickTouchId = touch.identifier;
                    const rect = base.getBoundingClientRect();
                    this.stickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                } 
                // それ以外はすべて視点移動として処理
                else if (this.lookTouchId === null) {
                    this.lookTouchId = null;
                    this.lookTouchId = touch.identifier;
                    this.lastLookPos = { x: touch.clientX, y: touch.clientY };
                }
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];

                // 1. スティックの移動処理
                if (this.stickActive && touch.identifier === this.stickTouchId) {
                    const dx = touch.clientX - this.stickStartPos.x;
                    const dy = touch.clientY - this.stickStartPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx);
                    let moveX = dx; let moveY = dy;

                    if (distance > maxRadius) {
                        moveX = Math.cos(angle) * maxRadius;
                        moveY = Math.sin(angle) * maxRadius;
                    }
                    knob.style.transform = `translate(${moveX}px, ${moveY}px)`;
                    this.stickMoveVector.x = moveX / maxRadius;
                    this.stickMoveVector.y = -(moveY / maxRadius);
                    
                    if (this.playerState.onStickMove) this.playerState.onStickMove(this.stickMoveVector.x, this.stickMoveVector.y);
                }

                // 2. 視点移動の処理（移動しながら同時に実行可能）
                if (touch.identifier === this.lookTouchId) {
                    const movementX = touch.clientX - this.lastLookPos.x;
                    const movementY = touch.clientY - this.lastLookPos.y;
                    
                    if (this.playerState.onLookMove) {
                        this.playerState.onLookMove(movementX, movementY);
                    }
                    this.lastLookPos = { x: touch.clientX, y: touch.clientY };
                }
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === this.stickTouchId) {
                    this.stickActive = false;
                    this.stickTouchId = null;
                    knob.style.transform = `translate(0px, 0px)`;
                    this.stickMoveVector = { x: 0, y: 0 };
                    if (this.playerState.onStickMove) this.playerState.onStickMove(0, 0);
                }
                if (touch.identifier === this.lookTouchId) {
                    this.lookTouchId = null;
                }
            }
        });

        // ボタンイベントの紐付け
        document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); if (this.playerState.onJump) this.playerState.onJump(); });
        const sprintBtn = document.getElementById('btn-sprint');
        sprintBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.setSprintUI(true); if (this.playerState.onSprint) this.playerState.onSprint(true); });
        sprintBtn.addEventListener('touchend', () => { this.setSprintUI(false); if (this.playerState.onSprint) this.playerState.onSprint(false); });
        
        const leanLBtn = document.getElementById('btn-lean-l');
        leanLBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.setLeanUI('left'); if (this.playerState.onLean) this.playerState.onLean('left'); });
        leanLBtn.addEventListener('touchend', () => { this.setLeanUI('none'); if (this.playerState.onLean) this.playerState.onLean('none'); });
        
        const leanRBtn = document.getElementById('btn-lean-r');
        leanRBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.setLeanUI('right'); if (this.playerState.onLean) this.playerState.onLean('right'); });
        leanRBtn.addEventListener('touchend', () => { this.setLeanUI('none'); if (this.playerState.onLean) this.playerState.onLean('none'); });
    }

    setSprintUI(isSprinting) {
        const normal = document.getElementById('state-normal');
        const sprint = document.getElementById('state-sprint');
        if (normal && sprint) {
            normal.className = isSprinting ? '' : 'status-active';
            sprint.className = isSprinting ? 'status-active' : '';
        }
    }

    setLeanUI(direction) {
        document.getElementById('state-lean-l').className = direction === 'left' ? 'status-active' : '';
        document.getElementById('state-lean-n').className = direction === 'none' ? 'status-active' : '';
        document.getElementById('state-lean-r').className = direction === 'right' ? 'status-active' : '';
    }

    updateStamina(value) {
        const staminaEl = document.getElementById('ui-stamina');
        if (staminaEl) staminaEl.innerText = `${Math.max(0, Math.min(100, Math.floor(value)))}%`;
    }
}
