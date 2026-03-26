// controls.js - キーボード入力管理

class InputManager {
    constructor() {
        this.keys = {};
        this.pitch = 0;   // -1 to 1
        this.roll = 0;    // -1 to 1
        this.yaw = 0;     // -1 to 1

        this._bindEvents();
    }

    _bindEvents() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            e.preventDefault();
        });
        // フォーカスが外れた時にリセット
        window.addEventListener('blur', () => {
            this.keys = {};
        });

        // マウスによるヨー・ピッチ操作
        window.addEventListener('mousemove', (e) => {
            // 画面中心を原点とする (-1.0 ~ 1.0 の範囲に正規化)
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            
            // X軸オフセット -> ヨー（右で右旋回、左で左旋回）
            let y = (cx - e.clientX) / cx;
            
            // Y軸オフセット -> ピッチ（反転なし：マウス上で機首上げ、下で機首下げ）
            let p = (cy - e.clientY) / cy;

            // デッドゾーンの設定（中央付近は操作しないように）
            const deadzone = 0.05;
            this.yaw = Math.abs(y) > deadzone ? y : 0;
            this.pitch = Math.abs(p) > deadzone ? p : 0;
        });
    }

    isPressed(code) {
        return !!this.keys[code];
    }

    update(aircraft) {
        // ロール (A=左傾き, D=右傾き)
        this.roll = 0;
        if (this.isPressed('KeyA') || this.isPressed('ArrowLeft')) this.roll = 1;
        if (this.isPressed('KeyD') || this.isPressed('ArrowRight')) this.roll = -1;

        // スロットル (W=増加, S=減少)
        if (this.isPressed('KeyW')) {
            aircraft.throttle = Math.min(1, aircraft.throttle + 0.005);
        }
        if (this.isPressed('KeyS')) {
            aircraft.throttle = Math.max(0, aircraft.throttle - 0.005);
        }

        // ブレーキ
        aircraft.braking = this.isPressed('KeyB');
    }

    // 単発キー入力（トグル用）
    consumeKey(code) {
        if (this.keys[code]) {
            this.keys[code] = false;
            return true;
        }
        return false;
    }
}
