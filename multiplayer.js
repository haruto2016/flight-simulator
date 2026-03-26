// multiplayer.js - Supabase Realtimeを用いた他プレイヤーの同期管理

const SUPABASE_URL = 'https://xkkwpulnaotdbbfpivtu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhra3dwdWxuYW90ZGJiZnBpdnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODcwMjcsImV4cCI6MjA5MDA2MzAyN30.3J35rswQSm43tcsXjX73ZvrtEMMkWpiWWfhJvg7r65U';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class MultiplayerManager {
    constructor(scene, aircraft) {
        this.scene = scene;
        this.aircraft = aircraft;
        this.channel = null;
        this.remotePlayers = new Map();
        this.myId = 'player_' + Math.random().toString(36).substr(2, 9);
        this.connected = false;
        this.lastBroadcast = 0;
        this.playerCountEl = document.getElementById('player-count');
    }

    _updatePlayerCountDisplay() {
        if (this.playerCountEl) {
            this.playerCountEl.textContent = `🌐 オンライン: ${this.remotePlayers.size + 1}人`;
        }
    }

    connect(url) {
        // url is ignored, we connect to supabase channel
        this.channel = supabaseClient.channel('flight-room', {
            config: {
                broadcast: { self: false }
            }
        });

        this.channel.on('broadcast', { event: 'flight-state' }, (payload) => {
            this._updateSingleRemotePlayer(payload.payload);
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Connected to Supabase Realtime!");
                this.connected = true;
                this._updatePlayerCountDisplay();
            }
        });
    }

    update(dt) {
        // 自機状態の送信 (おおよそ秒間10回程度に制限)
        const now = performance.now();
        if (this.connected && this.channel && (now - this.lastBroadcast > 100)) {
            const state = {
                id: this.myId,
                position: {x: this.aircraft.position.x, y: this.aircraft.position.y, z: this.aircraft.position.z},
                quaternion: {
                    x: this.aircraft.quaternion.x, 
                    y: this.aircraft.quaternion.y, 
                    z: this.aircraft.quaternion.z, 
                    w: this.aircraft.quaternion.w
                },
                gearDown: this.aircraft.gearDown
            };
            this.channel.send({
                type: 'broadcast',
                event: 'flight-state',
                payload: state
            });
            this.lastBroadcast = now;
        }

        // 他プレイヤーの位置補間 (Lerp/Slerp でカクつきを抑える)
        const lerpFactor = Math.min(10 * dt, 1.0);
        this.remotePlayers.forEach((player, id) => {
            // 切断されたプレイヤーの削除 (5秒以上更新がなければ削除)
            if (now - player.lastUpdate > 5000) {
                this.scene.remove(player.mesh);
                this.remotePlayers.delete(id);
                this._updatePlayerCountDisplay();
                return;
            }

            player.mesh.position.lerp(player.targetPosition, lerpFactor);
            player.mesh.quaternion.slerp(player.targetQuaternion, lerpFactor);
            if (player.gearGroup) {
                player.gearGroup.visible = player.targetGearDown;
            }
        });
    }

    _updateSingleRemotePlayer(pData) {
        if (pData.id === this.myId) return; // 自分自身は描写から除外
        
        let player = this.remotePlayers.get(pData.id);
        if (!player) {
            // 新規プレイヤーのスポーン
            player = this._createRemoteAircraft();
            this.scene.add(player.mesh);
            this.remotePlayers.set(pData.id, player);
            this._updatePlayerCountDisplay();
            
            // 初回は即座に位置を合わせる
            player.mesh.position.set(pData.position.x, pData.position.y, pData.position.z);
            player.mesh.quaternion.set(pData.quaternion.x, pData.quaternion.y, pData.quaternion.z, pData.quaternion.w);
        }
        
        // 目標位置の更新
        player.targetPosition.set(pData.position.x, pData.position.y, pData.position.z);
        player.targetQuaternion.set(pData.quaternion.x, pData.quaternion.y, pData.quaternion.z, pData.quaternion.w);
        player.targetGearDown = pData.gearDown;
        player.lastUpdate = performance.now();
    }

    _createRemoteAircraft() {
        const group = new THREE.Group();

        // 胴体 (他プレイヤーは識別しやすく少し赤っぽくする)
        const fuselageGeo = new THREE.CylinderGeometry(1.2, 0.8, 12, 8);
        fuselageGeo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshPhongMaterial({ color: 0xaa4444, shininess: 50 });
        const fuselage = new THREE.Mesh(fuselageGeo, mat);
        group.add(fuselage);

        // 主翼
        const wingGeo = new THREE.BoxGeometry(16, 0.2, 2.5);
        const wingMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        group.add(wings);

        // 垂直尾翼
        const vStabGeo = new THREE.BoxGeometry(0.15, 3, 2);
        const vStab = new THREE.Mesh(vStabGeo, mat);
        vStab.position.set(0, 1.5, 5.5);
        group.add(vStab);

        // 着陸脚
        const gearGroup = new THREE.Group();
        const gearMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        const fGearGeo = new THREE.CylinderGeometry(0.1, 0.1, 2);
        const fGear = new THREE.Mesh(fGearGeo, gearMat);
        fGear.position.set(0, -2, -3);
        gearGroup.add(fGear);
        for (let side = -1; side <= 1; side += 2) {
            const mGear = new THREE.Mesh(fGearGeo, gearMat);
            mGear.position.set(side * 2.5, -2.1, 1);
            gearGroup.add(mGear);
        }
        group.add(gearGroup);

        return {
            mesh: group,
            gearGroup: gearGroup,
            targetPosition: new THREE.Vector3(),
            targetQuaternion: new THREE.Quaternion(),
            targetGearDown: true,
            lastUpdate: performance.now()
        };
    }
}
