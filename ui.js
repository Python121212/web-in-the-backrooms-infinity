// ui.js - 動く仮想スティック、およびプレイヤー状態のインジケータ管理

export class UIManager {
    constructor(playerStateCallbacks) {
        this.playerState = playerStateCallbacks;
        this.isMobile = this.detectMobile();
        
        this.stickActive = false;
        this.stickStartPos = { x: 0, y: 0 };
        this.stickMoveVector = { x: 0, y: 0 };

        // モバイル視点操作用変数
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

            /* ステータス表示位置の調整 */
            #status-display {
                position: absolute;
                bottom: 150px;
                left: 20px;
                color: #5e5a32;
                font-size: 14px;
                line-height: 1.5;
                text-shadow: 1px 1px 2px #000;
            }
            .status-active { color: #d1ca74; font-weight: bold; text-shadow: 0 0 5px rgba(209,202,116,0.5); }

            /* 仮想スティック */
            #joystick-base {
                position: absolute;
                bottom: 30px;
                left: 30px;
                width: 90px;
                height: 90px;
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #5e5a32;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: none;
            }
            #joystick-knob {
                width: 35px;
                height: 35px;
                background: #5e5a32;
                border-radius: 50%;
                transition: transform 0.05s ease;
            }

            /* スマホ用右側視点タッチパネル（透明な壁を右半分に配置） */
            #mobile-look-touchpad {
                position: absolute;
                top: 0;
                right: 0;
                width: 55%;
                height: 100%;
                touch-action: none;
                z-index: 5;
            }

            /* アクションボタン（最前面 z-index: 25） */
            .mobile-btn {
                position: absolute;
                width: 60px;
                height: 60px;
                background: rgba(0, 0, 0, 0.6);
                border: 2px solid #5e5a32;
                border-radius: 50%;
                color: #5e5a32;
                font-size: 11px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                touch-action: none;
                z-index: 25;
            }
            .mobile-btn:active {
                background: rgba(94, 90, 50, 0.7);
                color: #fff;
            }
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
            STATE: <span id="state-normal" class="status-active">NORMAL</span> 
                   <span id="state-sprint">SPRINT</span><br>
            LEAN: <span id="state-lean-l">LEFT</span> / <span id="state-lean-n" class="status-active">NONE</span> / <span id="state-lean-r">RIGHT</span>
        `;
        container.appendChild(statusDisplay);

        if (this.isMobile) {
            // 透明な視点操作用タッチパッドを右側に配置
            const lookPad = document.createElement('div');
            lookPad.id = 'mobile-look-touchpad';
            lookPad.className = 'interactive';
            container.appendChild(lookPad);

            // スティック
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
        btn.id = id;
        btn.className = 'mobile-btn interactive';
        btn.innerText = text;
        return btn;
    }

    bindEvents() {
        if (this.isMobile) {
            const base = document.getElementById('joystick-base');
            const knob = document.getElementById('joystick-knob');
            const lookPad = document.getElementById('mobile-look-touchpad');
            const maxRadius = 35;

            // スティック操作
            base.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.stickActive = true;
                const touch = e.touches[0];
                const rect = base.getBoundingClientRect();
                this.stickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            });

            window.addEventListener('touchmove', (e) => {
                if (!this.stickActive) return;
                let targetTouch = null;
                for (let t of e.touches) {
                    if (t.target.id === 'joystick-base' || t.target.id === 'joystick-knob') {
                        targetTouch = t; break;
                    }
                }
                if (!targetTouch) return;

                const dx = targetTouch.clientX - this.stickStartPos.x;
                const dy = targetTouch.clientY - this.stickStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                let angle = Math.atan2(dy, dx);
                let moveX = dx; let moveY = dy;

                if (distance > maxRadius) {
                    moveX = Math.cos(angle) * maxRadius;
                    moveY = Math.sin(angle) * maxRadius;
                }
                knob.style.transform = `translate(${moveX}px, ${moveY}px)`;
                this.stickMoveVector.x = moveX / maxRadius;
                this.stickMoveVector.y = -(moveY / maxRadius);
                
                if (this.playerState.onStickMove) this.playerState.onStickMove(this.stickMoveVector.x, this.stickMoveVector.y);
            }, { passive: false });

            window.addEventListener('touchend', () => {
                if (!this.stickActive) return;
                this.stickActive = false;
                knob.style.transform = `translate(0px, 0px)`;
                this.stickMoveVector = { x: 0, y: 0 };
                if (this.playerState.onStickMove) this.playerState.onStickMove(0, 0);
            });

            // 右側視点操作タッチパッドのドラッグロジック
            lookPad.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.changedTouches[0];
                this.lookTouchId = touch.identifier;
                this.lastLookPos = { x: touch.clientX, y: touch.clientY };
            });

            lookPad.addEventListener('touchmove', (e) => {
                if (this.lookTouchId === null) return;
                e.preventDefault();
                for (let t of e.touches) {
                    if (t.identifier === this.lookTouchId) {
                        const movementX = t.clientX - this.lastLookPos.x;
                        const movementY = t.clientY - this.lastLookPos.y;
                        
                        if (this.playerState.onLookMove) {
                            this.playerState.onLookMove(movementX, movementY);
                        }
                        this.lastLookPos = { x: t.clientX, y: t.clientY };
                        break;
                    }
                }
            }, { passive: false });

            lookPad.addEventListener('touchend', (e) => {
                for (let t of e.changedTouches) {
                    if (t.identifier === this.lookTouchId) {
                        this.lookTouchId = null;
                        break;
                    }
                }
            });

            // アクションボタン
            document.getElementById('btn-jump').addEventListener('touchstart', (e) => {
                e.preventDefault(); if (this.playerState.onJump) this.playerState.onJump();
            });
            const sprintBtn = document.getElementById('btn-sprint');
            sprintBtn.addEventListener('touchstart', (e) => {
                e.preventDefault(); this.setSprintUI(true); if (this.playerState.onSprint) this.playerState.onSprint(true);
            });
            sprintBtn.addEventListener('touchend', () => {
                this.setSprintUI(false); if (this.playerState.onSprint) this.playerState.onSprint(false);
            });
            const leanLBtn = document.getElementById('btn-lean-l');
            leanLBtn.addEventListener('touchstart', (e) => {
                e.preventDefault(); this.setLeanUI('left'); if (this.playerState.onLean) this.playerState.onLean('left');
            });
            leanLBtn.addEventListener('touchend', () => {
                this.setLeanUI('none'); if (this.playerState.onLean) this.playerState.onLean('none');
            });
            const leanRBtn = document.getElementById('btn-lean-r');
            leanRBtn.addEventListener('touchstart', (e) => {
                e.preventDefault(); this.setLeanUI('right'); if (this.playerState.onLean) this.playerState.onLean('right');
            });
            leanRBtn.addEventListener('touchend', () => {
                this.setLeanUI('none'); if (this.playerState.onLean) this.playerState.onLean('none');
            });
        }
    }

    setSprintUI(isSprinting) {
        const normal = document.getElementById('state-normal');
        const sprint = document.getElementById('state-sprint');
        if (!normal || !sprint) return;
        normal.className = isSprinting ? '' : 'status-active';
        sprint.className = isSprinting ? 'status-active' : '';
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
