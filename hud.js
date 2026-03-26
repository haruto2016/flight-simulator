// hud.js - ヘッドアップディスプレイ管理

class HUDManager {
    constructor() {
        this.visible = true;
        this.minimapVisible = true;
        this.attitudeCanvas = document.getElementById('attitude-canvas');
        this.attitudeCtx = this.attitudeCanvas ? this.attitudeCanvas.getContext('2d') : null;
        this.minimapCanvas = document.getElementById('minimap-canvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
    }

    toggle() {
        this.visible = !this.visible;
        document.getElementById('hud').style.display = this.visible ? '' : 'none';
    }

    toggleMinimap() {
        this.minimapVisible = !this.minimapVisible;
        document.getElementById('minimap-container').style.display = this.minimapVisible ? '' : 'none';
    }

    update(aircraft) {
        if (!this.visible) return;

        // --- 速度表示 ---
        const speed = Math.round(aircraft.speedKnots);
        document.getElementById('speed-readout').textContent = speed;
        this._updateSpeedTape(speed);

        // --- 高度表示 ---
        const alt = Math.round(aircraft.altitudeFeet);
        document.getElementById('alt-readout').textContent = alt;
        this._updateAltTape(alt);

        // --- ヘディング ---
        this._updateHeading(aircraft.heading);

        // --- スロットル ---
        const thrPct = Math.round(aircraft.throttle * 100);
        document.getElementById('throttle-bar').style.width = thrPct + '%';
        document.getElementById('throttle-value').textContent = thrPct + '%';

        // --- 垂直速度 ---
        const vs = Math.round(aircraft.verticalSpeedFPM);
        const vsEl = document.getElementById('vs-value');
        vsEl.textContent = (vs >= 0 ? '+' : '') + vs;
        vsEl.style.color = vs > 200 ? '#72f5c4' : vs < -500 ? '#fc4e4e' : '#72f5c4';

        // --- G力 ---
        document.getElementById('g-force').textContent = aircraft.gForce.toFixed(1);

        // --- ギア ---
        const gearEl = document.getElementById('gear-indicator');
        const gearValEl = gearEl.querySelector('.hud-info-value');
        gearValEl.textContent = aircraft.gearDown ? 'DOWN' : 'UP';
        gearValEl.className = 'hud-info-value ' + (aircraft.gearDown ? 'gear-down' : 'gear-up');

        // --- フラップ ---
        document.getElementById('flap-value').textContent = aircraft.flapAngle + '°';

        // --- ブレーキ ---
        const brakeEl = document.getElementById('brake-indicator');
        brakeEl.querySelector('.hud-info-value').textContent = aircraft.braking ? 'ON' : 'OFF';
        brakeEl.querySelector('.hud-info-value').style.color = aircraft.braking ? '#fc4e4e' : '#72f5c4';

        // --- 姿勢指示器 ---
        this._drawAttitude(aircraft);

        // --- ミニマップ ---
        if (this.minimapVisible) {
            this._drawMinimap(aircraft);
        }

        // --- 警告 ---
        const stallWarn = document.getElementById('stall-warning');
        const overspeedWarn = document.getElementById('overspeed-warning');

        // 失速警告
        if (aircraft.speedKnots < 70 && !aircraft.onGround && aircraft.altitudeFeet > 50) {
            stallWarn.style.display = '';
        } else {
            stallWarn.style.display = 'none';
        }

        // 超過速度警告
        if (aircraft.speedKnots > 450) {
            overspeedWarn.style.display = '';
        } else {
            overspeedWarn.style.display = 'none';
        }

        // --- フライトパスマーカー ---
        this._updateFlightPathMarker(aircraft);
    }

    _updateSpeedTape(speed) {
        const tape = document.getElementById('speed-tape');
        if (!tape) return;
        let html = '';
        const step = 20;
        const range = 100;
        const startSpeed = Math.floor((speed - range) / step) * step;
        for (let s = startSpeed; s <= speed + range; s += step) {
            if (s < 0) continue;
            const offset = ((speed - s) / range) * 100;
            html += `<div style="position:absolute;top:${50 + offset}%;left:0;width:100%;text-align:center;
                font-family:Orbitron,sans-serif;font-size:0.65rem;color:rgba(78,202,252,0.6);
                transform:translateY(-50%)">${s}</div>`;
        }
        tape.innerHTML = html;
    }

    _updateAltTape(alt) {
        const tape = document.getElementById('alt-tape');
        if (!tape) return;
        let html = '';
        const step = 100;
        const range = 500;
        const startAlt = Math.floor((alt - range) / step) * step;
        for (let a = startAlt; a <= alt + range; a += step) {
            if (a < 0) continue;
            const offset = ((alt - a) / range) * 100;
            html += `<div style="position:absolute;top:${50 + offset}%;left:0;width:100%;text-align:center;
                font-family:Orbitron,sans-serif;font-size:0.65rem;color:rgba(78,202,252,0.6);
                transform:translateY(-50%)">${a}</div>`;
        }
        tape.innerHTML = html;
    }

    _updateHeading(heading) {
        const tape = document.getElementById('heading-tape');
        if (!tape) return;
        const labels = {
            0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
            180: 'S', 225: 'SW', 270: 'W', 315: 'NW', 360: 'N'
        };
        let html = '';
        const range = 60;
        for (let h = heading - range; h <= heading + range; h += 5) {
            let displayH = ((h % 360) + 360) % 360;
            const offset = ((h - heading) / range) * 200 + 200;
            const roundH = Math.round(displayH);
            const label = labels[roundH] || (roundH % 10 === 0 ? roundH + '°' : '|');
            const isCardinal = labels[roundH];
            html += `<span style="position:absolute;left:${offset}px;
                color:${isCardinal ? '#72f5c4' : 'rgba(78,202,252,0.5)'};
                font-size:${isCardinal ? '0.8rem' : '0.6rem'};
                font-weight:${isCardinal ? '700' : '400'}">${label}</span>`;
        }
        tape.innerHTML = html;
    }

    _drawAttitude(aircraft) {
        const ctx = this.attitudeCtx;
        if (!ctx) return;
        const w = 280, h = 280;
        const cx = w / 2, cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // 機体の姿勢を取得
        const euler = new THREE.Euler().setFromQuaternion(aircraft.quaternion, 'ZXY');
        const pitch = euler.x;
        const roll = euler.z;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 130, 0, Math.PI * 2);
        ctx.clip();

        // 回転
        ctx.translate(cx, cy);
        ctx.rotate(-roll);

        // ピッチオフセット
        const pitchPixels = pitch * (180 / Math.PI) * 3;

        // 上半分（空）
        ctx.fillStyle = 'rgba(30, 80, 160, 0.3)';
        ctx.fillRect(-150, -200 + pitchPixels, 300, 200);

        // 下半分（地面）
        ctx.fillStyle = 'rgba(100, 60, 20, 0.3)';
        ctx.fillRect(-150, pitchPixels, 300, 200);

        // 地平線
        ctx.strokeStyle = 'rgba(78, 202, 252, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-150, pitchPixels);
        ctx.lineTo(150, pitchPixels);
        ctx.stroke();

        // ピッチラダー
        ctx.strokeStyle = 'rgba(78, 202, 252, 0.4)';
        ctx.fillStyle = 'rgba(78, 202, 252, 0.6)';
        ctx.font = '10px Orbitron, sans-serif';
        ctx.lineWidth = 1;
        for (let deg = -30; deg <= 30; deg += 5) {
            if (deg === 0) continue;
            const y = pitchPixels - deg * 3;
            const halfWidth = deg % 10 === 0 ? 40 : 20;
            ctx.beginPath();
            ctx.moveTo(-halfWidth, y);
            ctx.lineTo(halfWidth, y);
            ctx.stroke();
            if (deg % 10 === 0) {
                ctx.textAlign = 'right';
                ctx.fillText(Math.abs(deg) + '', -halfWidth - 4, y + 4);
                ctx.textAlign = 'left';
                ctx.fillText(Math.abs(deg) + '', halfWidth + 4, y + 4);
            }
        }

        ctx.restore();

        // 機体シンボル（固定）
        ctx.strokeStyle = '#72f5c4';
        ctx.lineWidth = 3;
        ctx.beginPath();
        // 左翼
        ctx.moveTo(cx - 60, cy);
        ctx.lineTo(cx - 25, cy);
        ctx.lineTo(cx - 25, cy + 8);
        ctx.stroke();
        ctx.beginPath();
        // 右翼
        ctx.moveTo(cx + 60, cy);
        ctx.lineTo(cx + 25, cy);
        ctx.lineTo(cx + 25, cy + 8);
        ctx.stroke();
        // 中央ドット
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#72f5c4';
        ctx.fill();

        // バンク角指標
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(78, 202, 252, 0.3)';
        ctx.lineWidth = 1;
        const bankAngles = [10, 20, 30, 45, 60];
        for (const angle of bankAngles) {
            for (const side of [-1, 1]) {
                const rad = (angle * side) * Math.PI / 180;
                const ir = 120, or = 130;
                ctx.beginPath();
                ctx.moveTo(Math.sin(rad) * ir, -Math.cos(rad) * ir);
                ctx.lineTo(Math.sin(rad) * or, -Math.cos(rad) * or);
                ctx.stroke();
            }
        }
        // 現在のバンク指標
        ctx.rotate(-roll);
        ctx.fillStyle = '#72f5c4';
        ctx.beginPath();
        ctx.moveTo(0, -125);
        ctx.lineTo(-6, -115);
        ctx.lineTo(6, -115);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    _drawMinimap(aircraft) {
        const ctx = this.minimapCtx;
        if (!ctx) return;
        const w = 180, h = 180;
        const cx = w / 2, cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = 'rgba(5, 15, 30, 0.8)';
        ctx.beginPath();
        ctx.arc(cx, cy, 88, 0, Math.PI * 2);
        ctx.fill();

        // グリッド
        ctx.strokeStyle = 'rgba(78, 202, 252, 0.1)';
        ctx.lineWidth = 0.5;
        for (let r = 20; r < 90; r += 20) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        // 十字線
        ctx.beginPath();
        ctx.moveTo(cx, cy - 85);
        ctx.lineTo(cx, cy + 85);
        ctx.moveTo(cx - 85, cy);
        ctx.lineTo(cx + 85, cy);
        ctx.stroke();

        // 滑走路
        const scale = 0.015;
        const headingRad = aircraft.heading * Math.PI / 180;
        const runwayDx = -aircraft.position.x * scale;
        const runwayDz = -aircraft.position.z * scale;
        // ヘディングに合わせて回転
        const rotX = runwayDx * Math.cos(headingRad) - runwayDz * Math.sin(headingRad);
        const rotZ = runwayDx * Math.sin(headingRad) + runwayDz * Math.cos(headingRad);

        if (Math.abs(rotX) < 85 && Math.abs(rotZ) < 85) {
            ctx.fillStyle = '#72f5c4';
            ctx.save();
            ctx.translate(cx + rotX, cy + rotZ);
            ctx.rotate(-headingRad);
            ctx.fillRect(-1, -8, 2, 16);
            ctx.restore();
        }

        // 機体マーカー（中央）
        ctx.fillStyle = '#4ecafc';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx - 5, cy + 5);
        ctx.lineTo(cx, cy + 2);
        ctx.lineTo(cx + 5, cy + 5);
        ctx.closePath();
        ctx.fill();

        // 方位表示
        ctx.fillStyle = 'rgba(78, 202, 252, 0.5)';
        ctx.font = '9px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        const dirs = ['N', 'E', 'S', 'W'];
        for (let i = 0; i < 4; i++) {
            const angle = (i * 90 - aircraft.heading) * Math.PI / 180;
            const dx = Math.sin(angle) * 78;
            const dy = -Math.cos(angle) * 78;
            ctx.fillText(dirs[i], cx + dx, cy + dy + 3);
        }
    }

    _updateFlightPathMarker(aircraft) {
        const marker = document.getElementById('flight-path-marker');
        if (!marker) return;

        if (aircraft.speed > 5) {
            const velDir = aircraft.velocity.clone().normalize();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion);

            const lateralDev = velDir.dot(right) * 80;
            const verticalDev = -velDir.dot(up) * 80;

            marker.style.transform = `translate(calc(-50% + ${lateralDev}px), calc(-50% + ${verticalDev}px))`;
            marker.style.opacity = '0.8';
        } else {
            marker.style.transform = 'translate(-50%, -50%)';
            marker.style.opacity = '0.3';
        }
    }
}
