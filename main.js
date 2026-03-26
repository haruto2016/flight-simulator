// main.js - メインゲームループ・シーン管理

(function () {
    'use strict';

    // --- 状態管理 ---
    const State = {
        LOADING: 'loading',
        MENU: 'menu',
        PLAYING: 'playing',
        PAUSED: 'paused',
        CRASHED: 'crashed'
    };

    let currentState = State.LOADING;
    let renderer, scene, camera;
    let skyManager, terrainManager, aircraft, inputManager, hudManager, multiplayerManager;
    let landingGuidanceActive = false;
    let nearestAirport = null;
    let guidanceRings = [];
    let landingMessageEl;
    let cameraMode = 'chase'; // 'chase', 'cockpit', 'free'
    let cockpitHidden = false;
    let clock;

    // --- DOM要素 ---
    const loadingScreen = document.getElementById('loading-screen');
    const loadingBar = document.getElementById('loading-bar');
    const loadingText = document.getElementById('loading-text');
    const startMenu = document.getElementById('start-menu');
    const hud = document.getElementById('hud');
    const pauseMenu = document.getElementById('pause-menu');
    const crashScreen = document.getElementById('crash-screen');
    const canvas = document.getElementById('game-canvas');

    // =================================================
    // 初期化
    // =================================================
    function init() {
        // Three.js レンダラー
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: false
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = false;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        // シーン
        scene = new THREE.Scene();

        // カメラ
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 20000);
        camera.position.set(0, 12, 375);

        // マネージャー初期化
        skyManager = new SkyManager(scene);
        terrainManager = new TerrainManager(scene);
        aircraft = new Aircraft(scene);
        inputManager = new InputManager();
        hudManager = new HUDManager();
        multiplayerManager = new MultiplayerManager(scene, aircraft);
        landingMessageEl = document.getElementById('landing-guide-message');

        clock = new THREE.Clock();

        // ウィンドウリサイズ
        window.addEventListener('resize', onWindowResize);

        // ローディングシミュレーション
        simulateLoading();
    }

    // =================================================
    // ローディング画面
    // =================================================
    function simulateLoading() {
        let progress = 0;
        const messages = [
            { at: 10, text: 'レンダラー初期化中...' },
            { at: 25, text: '地形データ生成中...' },
            { at: 45, text: '機体モデル構築中...' },
            { at: 60, text: '大気システム構築中...' },
            { at: 75, text: 'HUDシステム準備中...' },
            { at: 90, text: '最終チェック...' },
            { at: 100, text: '準備完了' }
        ];

        const interval = setInterval(() => {
            progress += 1 + Math.random() * 2;
            if (progress > 100) progress = 100;

            loadingBar.style.width = progress + '%';

            for (const msg of messages) {
                if (progress >= msg.at) {
                    loadingText.textContent = msg.text;
                }
            }

            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                    startMenu.style.display = '';
                    currentState = State.MENU;
                }, 500);
            }
        }, 50);
    }

    // =================================================
    // ゲーム開始
    // =================================================
    function startGame() {
        const weather = document.getElementById('weather-select').value;
        const timeOfDay = document.getElementById('time-select').value;
        const planeType = document.getElementById('aircraft-select').value;

        startMenu.style.display = 'none';
        hud.style.display = '';
        currentState = State.PLAYING;

        // シーンをクリア（再スタート時）
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        // 各モジュール初期化
        skyManager = new SkyManager(scene);
        skyManager.init(timeOfDay, weather);

        terrainManager = new TerrainManager(scene);
        terrainManager.init();

        aircraft = new Aircraft(scene);
        aircraft.setType(planeType);
        aircraft.init();

        // マルチプレイヤーの再設定・接続
        multiplayerManager.aircraft = aircraft;
        if (!multiplayerManager.connected) {
            multiplayerManager.connect('ws://localhost:8081');
        }

        clock.start();

        // ゲームループ開始
        if (!animationRunning) {
            animationRunning = true;
            animate();
        }
    }

    // =================================================
    // ゲームループ
    // =================================================
    let animationRunning = false;

    function animate() {
        requestAnimationFrame(animate);

        if (currentState !== State.PLAYING) {
            renderer.render(scene, camera);
            return;
        }

        const dt = Math.min(clock.getDelta(), 0.05);

        // 入力更新
        inputManager.update(aircraft);

        // トグルキー処理
        handleToggleKeys();

        // 機体物理更新
        const result = aircraft.update(dt, {
            pitch: inputManager.pitch,
            roll: inputManager.roll,
            yaw: inputManager.yaw
        }, terrainManager);

        // 墜落チェック
        if (result === 'crash') {
            handleCrash();
            return;
        }

        // マネージャー更新
        skyManager.update(dt, aircraft.position);
        terrainManager.update(aircraft.position);
        multiplayerManager.update(dt);

        // 着陸ガイドチェック
        checkLandingGuidance(dt);

        // カメラ更新
        updateCamera(dt);

        // HUD更新
        hudManager.update(aircraft);

        // レンダリング
        renderer.render(scene, camera);
    }

    // =================================================
    // 着陸ガイドシステム
    // =================================================
    function checkLandingGuidance(dt) {
        if (!terrainManager || !terrainManager.airports) return;

        // 一番近い空港を探す
        let minDist = Infinity;
        let closest = null;
        for (const ap of terrainManager.airports) {
            const dx = aircraft.position.x - ap.x;
            const dz = aircraft.position.z - ap.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < minDist) {
                minDist = d;
                closest = ap;
            }
        }
        nearestAirport = closest;

        if (landingGuidanceActive) {
            updateLandingGuidance();
            return;
        }

        // 飛行中かつ空港に近い場合、ガイドを提案
        if (minDist > 1500 && minDist < 8000 && aircraft.position.y < 4000 && aircraft.position.y > 100) {
            landingMessageEl.style.display = 'block';
            landingMessageEl.innerHTML = '近くに空港があります。<br>[Y]で着陸ガイド開始';
            
            if (inputManager.consumeKey('KeyY')) {
                startLandingGuidance();
            }
        } else {
            if(landingMessageEl) landingMessageEl.style.display = 'none';
        }
    }

    function startLandingGuidance() {
        landingGuidanceActive = true;
        landingMessageEl.innerHTML = '着陸ガイドを開始します。光るリングをくぐってください。';
        
        const zSign = (aircraft.position.z > nearestAirport.z) ? 1 : -1;
        const rwX = nearestAirport.x;
        
        // 誘導リングを生成
        const ringCount = 12;
        const ringGeo = new THREE.TorusGeometry(35, 2.5, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x72f5c4, transparent: true, opacity: 0.6 });
        
        for(let i = 0; i < ringCount; i++) {
            const dist = 5000 - i * 380; 
            const height = 500 - i * 40;
            const ringZ = nearestAirport.z + zSign * dist;

            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(rwX, height, ringZ);
            scene.add(ring);
            guidanceRings.push(ring);
        }
    }

    function updateLandingGuidance() {
        const dx = aircraft.position.x - nearestAirport.x;
        const dz = aircraft.position.z - nearestAirport.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        let msg = 'リングをくぐって降下してください';

        if (aircraft.speedKnots > 130) {
            msg = '速度が速すぎます。スロットル(S)を下げてください';
        } else if (dist < 4000 && !aircraft.gearDown) {
            msg = '着陸脚(G)を出してください';
        } else if (dist < 3000 && aircraft.flapAngle < 20) {
            msg = 'フラップ(F)を出して減速してください';
        } else if (dist < 1500) {
            msg = '降下率に注意して、ゆっくり滑走路へ...';
        }

        // 着陸判定
        if (dist < 800 && aircraft.position.y < 5) {
            msg = '着陸完了！ブレーキ(B)で停止してください';
            if (aircraft.speedKnots < 5) {
                setTimeout(endLandingGuidance, 3000);
            }
        }
        
        // 空港を通り過ぎたか、離れすぎた場合
        if (dist > 8000) {
           endLandingGuidance();
           return;
        }

        landingMessageEl.style.display = 'block';
        landingMessageEl.innerHTML = msg;
        
        // リングを回転させるアニメーション
        guidanceRings.forEach(r => r.rotation.z += 0.02);
    }

    function endLandingGuidance() {
        landingGuidanceActive = false;
        landingMessageEl.style.display = 'none';
        guidanceRings.forEach(r => scene.remove(r));
        guidanceRings = [];
    }

    // =================================================
    // トグルキー処理
    // =================================================
    function handleToggleKeys() {
        // G: ギア切替
        if (inputManager.consumeKey('KeyG')) {
            aircraft.gearDown = !aircraft.gearDown;
        }

        // F: フラップ切替
        if (inputManager.consumeKey('KeyF')) {
            aircraft.flapAngle = (aircraft.flapAngle + 10) % 40; // 0, 10, 20, 30
        }

        // V: カメラモード切替
        if (inputManager.consumeKey('KeyV')) {
            const modes = ['chase', 'cockpit', 'free'];
            const idx = (modes.indexOf(cameraMode) + 1) % modes.length;
            cameraMode = modes[idx];
        }

        // C: コックピット表示切替
        if (inputManager.consumeKey('KeyC')) {
            cockpitHidden = !cockpitHidden;
            if (aircraft.model) {
                aircraft.model.visible = !cockpitHidden;
            }
        }

        // H: HUD表示切替
        if (inputManager.consumeKey('KeyH')) {
            hudManager.toggle();
        }

        // M: ミニマップ切替
        if (inputManager.consumeKey('KeyM')) {
            hudManager.toggleMinimap();
        }

        // Escape: ポーズ
        if (inputManager.consumeKey('Escape')) {
            pauseGame();
        }
    }

    // =================================================
    // カメラ制御
    // =================================================
    const cameraSmooth = {
        pos: new THREE.Vector3(),
        lookAt: new THREE.Vector3(),
        initialized: false
    };

    function updateCamera(dt) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion);

        let targetPos, targetLookAt;

        switch (cameraMode) {
            case 'chase': {
                // 機体の後ろ上方から追従
                const backUp = aircraft.position.clone()
                    .add(forward.clone().multiplyScalar(15))    // 少し後方
                    .add(up.clone().multiplyScalar(6));         // 少し上方
                const behind = aircraft.position.clone()
                    .sub(forward.clone().multiplyScalar(25))
                    .add(new THREE.Vector3(0, 8, 0));

                targetPos = behind;
                targetLookAt = backUp;
                break;
            }
            case 'cockpit': {
                // コックピット視点
                targetPos = aircraft.position.clone()
                    .add(forward.clone().multiplyScalar(-1))
                    .add(up.clone().multiplyScalar(1.2));
                targetLookAt = aircraft.position.clone()
                    .add(forward.clone().multiplyScalar(100));
                break;
            }
            case 'free': {
                // 横からの視点
                targetPos = aircraft.position.clone()
                    .add(right.clone().multiplyScalar(30))
                    .add(new THREE.Vector3(0, 5, 0));
                targetLookAt = aircraft.position.clone();
                break;
            }
        }

        // スムーズ補間
        const smoothFactor = 1 - Math.pow(0.01, dt);
        if (!cameraSmooth.initialized) {
            cameraSmooth.pos.copy(targetPos);
            cameraSmooth.lookAt.copy(targetLookAt);
            cameraSmooth.initialized = true;
        } else {
            cameraSmooth.pos.lerp(targetPos, smoothFactor);
            cameraSmooth.lookAt.lerp(targetLookAt, smoothFactor);
        }

        camera.position.copy(cameraSmooth.pos);
        camera.lookAt(cameraSmooth.lookAt);

        // コックピットモードでは機体を隠す
        if (aircraft.model) {
            if (cameraMode === 'cockpit') {
                aircraft.model.visible = false;
            } else if (!cockpitHidden) {
                aircraft.model.visible = true;
            }
        }
    }

    // =================================================
    // ポーズ
    // =================================================
    function pauseGame() {
        currentState = State.PAUSED;
        pauseMenu.style.display = '';
        clock.stop();
    }

    function resumeGame() {
        currentState = State.PLAYING;
        pauseMenu.style.display = 'none';
        clock.start();
    }

    // =================================================
    // 墜落処理
    // =================================================
    function handleCrash() {
        currentState = State.CRASHED;
        crashScreen.style.display = '';
        const speed = Math.round(aircraft.speedKnots);
        document.getElementById('crash-message').textContent =
            `速度 ${speed} ノットで地面に衝突しました`;
    }

    // =================================================
    // ウィンドウリサイズ
    // =================================================
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // =================================================
    // ボタンイベント
    // =================================================
    document.getElementById('btn-start').addEventListener('click', startGame);

    document.getElementById('btn-resume').addEventListener('click', resumeGame);

    document.getElementById('btn-restart').addEventListener('click', () => {
        pauseMenu.style.display = 'none';
        crashScreen.style.display = 'none';
        cameraSmooth.initialized = false;
        startGame();
    });

    document.getElementById('btn-quit').addEventListener('click', () => {
        pauseMenu.style.display = 'none';
        hud.style.display = 'none';
        startMenu.style.display = '';
        currentState = State.MENU;
    });

    document.getElementById('btn-crash-restart').addEventListener('click', () => {
        crashScreen.style.display = 'none';
        cameraSmooth.initialized = false;
        startGame();
    });

    // Escapeキーでポーズ解除（ポーズ中）
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && currentState === State.PAUSED) {
            resumeGame();
        }
    });

    // =================================================
    // 起動
    // =================================================
    init();

})();
