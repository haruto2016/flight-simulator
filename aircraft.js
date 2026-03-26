// aircraft.js - Aircraft model and flight physics

class Aircraft {
    constructor(scene) {
        this.scene = scene;
        this.model = null;

        // Position & orientation
        this.position = new THREE.Vector3(0, 3.5, 350);
        this.velocity = new THREE.Vector3(0, 0, 0); // 滑走路上で静止
        this.quaternion = new THREE.Quaternion();
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

        // Flight state
        this.throttle = 0;           // 0-1
        this.pitch = 0;              // rad/s input
        this.roll = 0;               // rad/s input
        this.yaw = 0;                // rad/s input
        this.speed = 0;              // m/s (true airspeed)
        this.altitude = 3.5;         // meters -> displayed as feet
        this.heading = 0;            // degrees
        this.verticalSpeed = 0;      // m/s
        this.gForce = 1.0;
        this.angleOfAttack = 0;

        // Aircraft config
        this.gearDown = true;
        this.flapAngle = 0;          // 0, 10, 20, 30
        this.braking = false;
        this.onGround = true;

        // Physics constants (simplified)
        this.mass = 5000;            // kg
        this.wingArea = 30;          // m²
        this.maxThrust = 50000;      // N
        this.dragCoeff = 0.025;
        this.liftCoeff = 1.2;
        this.maxSpeed = 250;         // m/s (~486 knots)
        this.stallSpeed = 30;        // m/s (~58 knots)

        // Propeller spin
        this.propAngle = 0;
        
        this.type = 'cessna';
        this.rollSpeedMultiplier = 1.0;
        this.pitchSpeedMultiplier = 1.0;
        this.engineCount = 1;
    }

    setType(type) {
        this.type = type;
        if (this.model) {
            this.scene.remove(this.model);
            this.model = null;
        }

        switch (type) {
            case 'fighter':
                this.mass = 12000;
                this.wingArea = 35;
                this.maxThrust = 200000; // Large thrust
                this.dragCoeff = 0.015;  // Low drag
                this.liftCoeff = 1.0;
                this.maxSpeed = 600;     // Very fast
                this.stallSpeed = 70;    // Stalls easily at low speed
                this.rollSpeedMultiplier = 3.5; // Very agile
                this.pitchSpeedMultiplier = 2.5;
                this.engineCount = 1;
                this.cameraChaseOffset = new THREE.Vector3(0, 5, 30);
                this.cameraCockpitOffset = new THREE.Vector3(0, 1.2, -2);
                break;
            case 'boeing':
                this.mass = 300000;
                this.wingArea = 500;
                this.maxThrust = 1000000;
                this.dragCoeff = 0.035;
                this.liftCoeff = 1.5;
                this.maxSpeed = 260;
                this.stallSpeed = 65;
                this.stallSpeed = 65;
                this.rollSpeedMultiplier = 0.3; // Very heavy/slow
                this.pitchSpeedMultiplier = 0.4;
                this.engineCount = 4;
                this.cameraChaseOffset = new THREE.Vector3(0, 15, 60);
                this.cameraCockpitOffset = new THREE.Vector3(0, 3, -18);
                break;
            case 'cessna':
            default:
                this.mass = 5000;
                this.wingArea = 30;
                this.maxThrust = 50000;
                this.dragCoeff = 0.025;
                this.liftCoeff = 1.2;
                this.maxSpeed = 150;
                this.stallSpeed = 30;
                this.stallSpeed = 30;
                this.rollSpeedMultiplier = 1.0;
                this.pitchSpeedMultiplier = 1.0;
                this.engineCount = 1;
                this.cameraChaseOffset = null; // Use default
                this.cameraCockpitOffset = null; // Use default
                break;
        }

        this._buildModel();
    }

    init() {
        this._buildModel();
    }

    _buildModel() {
        if (this.model) {
            this.scene.remove(this.model);
        }
        this.model = new THREE.Group();

        if (this.type === 'fighter') {
            this._buildFighterModel();
        } else if (this.type === 'boeing') {
            this._buildBoeingModel();
        } else {
            this._buildCessnaModel();
        }

        this.model.position.copy(this.position);
        this.model.quaternion.copy(this.quaternion);
        this.scene.add(this.model);
    }

    _buildCessnaModel() {

        // Fuselage
        const fuselageGeo = new THREE.CylinderGeometry(1.2, 0.8, 12, 8);
        fuselageGeo.rotateX(Math.PI / 2);
        const fuselageMat = new THREE.MeshPhongMaterial({
            color: 0xdddddd,
            shininess: 60,
            specular: 0x444444
        });
        const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
        this.model.add(fuselage);

        // Nose cone
        const noseGeo = new THREE.ConeGeometry(1.2, 3, 8);
        noseGeo.rotateX(-Math.PI / 2);
        const noseMat = new THREE.MeshPhongMaterial({ color: 0x2255aa, shininess: 80 });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.z = -7.5;
        this.model.add(nose);

        // Cockpit canopy
        const canopyGeo = new THREE.SphereGeometry(1.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const canopyMat = new THREE.MeshPhongMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.4,
            shininess: 100,
            specular: 0xffffff
        });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(0, 1.0, -2);
        canopy.scale.set(1, 0.6, 1.5);
        this.model.add(canopy);

        // Main wings
        const wingGeo = new THREE.BoxGeometry(16, 0.2, 2.5);
        const wingMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 40 });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 0);
        this.model.add(wings);

        // Wing tips (colored)
        for (let side = -1; side <= 1; side += 2) {
            const tipGeo = new THREE.BoxGeometry(0.3, 0.8, 0.6);
            const tipMat = new THREE.MeshPhongMaterial({ color: side < 0 ? 0xff0000 : 0x00ff00 });
            const tip = new THREE.Mesh(tipGeo, tipMat);
            tip.position.set(side * 8.1, 0, 0);
            this.model.add(tip);
        }

        // Tail - Horizontal stabilizer
        const hStabGeo = new THREE.BoxGeometry(6, 0.15, 1.5);
        const hStabMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        const hStab = new THREE.Mesh(hStabGeo, hStabMat);
        hStab.position.set(0, 0.2, 5.5);
        this.model.add(hStab);

        // Tail - Vertical stabilizer
        const vStabGeo = new THREE.BoxGeometry(0.15, 3, 2);
        const vStabMat = new THREE.MeshPhongMaterial({ color: 0x2255aa });
        const vStab = new THREE.Mesh(vStabGeo, vStabMat);
        vStab.position.set(0, 1.5, 5.5);
        this.model.add(vStab);

        // Tail logo stripe
        const stripeGeo = new THREE.BoxGeometry(0.17, 1.5, 2);
        const stripeMat = new THREE.MeshPhongMaterial({ color: 0xff3333 });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(0, 2.5, 5.5);
        this.model.add(stripe);

        // Engine nacelles
        for (let side = -1; side <= 1; side += 2) {
            const nacGeo = new THREE.CylinderGeometry(0.6, 0.6, 3, 8);
            nacGeo.rotateX(Math.PI / 2);
            const nacMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
            const nac = new THREE.Mesh(nacGeo, nacMat);
            nac.position.set(side * 4, -0.5, -0.5);
            this.model.add(nac);
        }

        // Propeller (spinning disc)
        const propGeo = new THREE.CircleGeometry(1.5, 3);
        const propMat = new THREE.MeshBasicMaterial({
            color: 0x333333,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        this.propeller = new THREE.Mesh(propGeo, propMat);
        this.propeller.position.z = -9;
        this.model.add(this.propeller);

        // Landing gear
        this.gearGroup = new THREE.Group();
        // Front gear
        const fGearGeo = new THREE.CylinderGeometry(0.1, 0.1, 2);
        const gearMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        const fGear = new THREE.Mesh(fGearGeo, gearMat);
        fGear.position.set(0, -2, -3);
        this.gearGroup.add(fGear);
        const fWheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
        fWheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
        const fWheel = new THREE.Mesh(fWheelGeo, wheelMat);
        fWheel.position.set(0, -3, -3);
        this.gearGroup.add(fWheel);

        // Main gear
        for (let side = -1; side <= 1; side += 2) {
            const mGearGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.2);
            const mGear = new THREE.Mesh(mGearGeo, gearMat);
            mGear.position.set(side * 2.5, -2.1, 1);
            this.gearGroup.add(mGear);

            const mWheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8);
            mWheelGeo.rotateZ(Math.PI / 2);
            const mWheel = new THREE.Mesh(mWheelGeo, wheelMat);
            mWheel.position.set(side * 2.5, -3.2, 1);
            this.gearGroup.add(mWheel);
        }
        this.model.add(this.gearGroup);
    }

    _buildFighterModel() {
        const bodyGeo = new THREE.ConeGeometry(1, 15, 8);
        bodyGeo.rotateX(-Math.PI / 2);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 80 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.model.add(body);

        // canopy - use scaled sphere instead of Capsule
        const canopyGeo = new THREE.SphereGeometry(0.8, 16, 16);
        const canopyMat = new THREE.MeshPhongMaterial({ color: 0x111111, transparent: true, opacity: 0.8 });
        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        canopy.position.set(0, 0.5, -2);
        canopy.scale.set(0.7, 0.7, 2.5);
        this.model.add(canopy);

        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.lineTo(6, 4);
        wingShape.lineTo(6, -2);
        wingShape.lineTo(0, -6);
        const wingGeo = new THREE.ShapeGeometry(wingShape);
        wingGeo.rotateX(Math.PI / 2);
        wingGeo.rotateY(Math.PI / 2);
        const wingMat = new THREE.MeshPhongMaterial({ color: 0x444444, side: THREE.DoubleSide });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 3);
        this.model.add(wings);

        const vStabGeo = new THREE.BoxGeometry(0.2, 3, 2);
        const vStabMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const vStab = new THREE.Mesh(vStabGeo, vStabMat);
        vStab.position.set(0, 1.5, 6);
        this.model.add(vStab);

        const exhaustGeo = new THREE.CylinderGeometry(0.8, 0.6, 2, 8);
        exhaustGeo.rotateX(Math.PI / 2);
        const exhaustMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
        const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
        exhaust.position.set(0, 0, 7);
        this.model.add(exhaust);

        this.gearGroup = new THREE.Group();
        const fGear = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), new THREE.MeshPhongMaterial({ color: 0x444444 }));
        fGear.position.set(0, -1.5, -4);
        this.gearGroup.add(fGear);
        for (let side = -1; side <= 1; side += 2) {
            const mGear = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), new THREE.MeshPhongMaterial({ color: 0x444444 }));
            mGear.position.set(side * 2, -1.5, 4);
            this.gearGroup.add(mGear);
        }
        this.model.add(this.gearGroup);
    }

    _buildBoeingModel() {
        const bodyGeo = new THREE.CylinderGeometry(3, 3, 40, 16);
        bodyGeo.rotateX(Math.PI / 2);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.model.add(body);

        const noseGeo = new THREE.SphereGeometry(3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        noseGeo.rotateX(-Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, bodyMat);
        nose.position.z = -20;
        this.model.add(nose);

        const tailGeo = new THREE.ConeGeometry(3, 8, 16);
        tailGeo.rotateX(Math.PI / 2);
        const tail = new THREE.Mesh(tailGeo, bodyMat);
        tail.position.z = 24;
        this.model.add(tail);

        const wingGeo = new THREE.BoxGeometry(45, 0.5, 12);
        const wingMat = new THREE.MeshPhongMaterial({ color: 0xdddddd });
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, -1, 2);
        wings.rotation.y = -Math.PI / 10;
        const wings2 = new THREE.Mesh(wingGeo, wingMat);
        wings2.position.set(0, -1, 2);
        wings2.rotation.y = Math.PI / 10;
        this.model.add(wings);
        this.model.add(wings2);

        const hStabGeo = new THREE.BoxGeometry(18, 0.4, 5);
        const hStab = new THREE.Mesh(hStabGeo, wingMat);
        hStab.position.set(0, 0, 24);
        this.model.add(hStab);

        const vStabGeo = new THREE.BoxGeometry(0.4, 8, 5);
        const vStabMat = new THREE.MeshPhongMaterial({ color: 0x2255aa });
        const vStab = new THREE.Mesh(vStabGeo, vStabMat);
        vStab.position.set(0, 4, 25);
        this.model.add(vStab);

        // hump - use scaled sphere instead of Capsule
        const humpGeo = new THREE.SphereGeometry(3, 16, 16);
        const hump = new THREE.Mesh(humpGeo, bodyMat);
        hump.scale.set(1, 1, 3);
        hump.position.set(0, 1.2, -12);
        this.model.add(hump);

        for(let side of [-1, 1]) {
            for(let pos of [8, 16]) {
                const engGeo = new THREE.CylinderGeometry(1, 1, 4, 12);
                engGeo.rotateX(Math.PI / 2);
                const engMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
                const engine = new THREE.Mesh(engGeo, engMat);
                engine.position.set(side * pos, -2.5, 4 + pos * 0.3);
                this.model.add(engine);
            }
        }

        this.gearGroup = new THREE.Group();
        const fGear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4), new THREE.MeshPhongMaterial({ color: 0x444444 }));
        fGear.position.set(0, -3, -15);
        this.gearGroup.add(fGear);
        for(let side of [-1, 1]) {
            for(let zOffset of [-1, 1]) {
                const mGear = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4), new THREE.MeshPhongMaterial({ color: 0x444444 }));
                mGear.position.set(side * 4, -3, 5 + zOffset * 2);
                this.gearGroup.add(mGear);
            }
        }
        this.model.add(this.gearGroup);
    }

    reset() {
        this.position.set(0, 3.5, 350);
        this.velocity.set(0, 0, 0);
        this.quaternion.identity();
        this.euler.set(0, 0, 0);
        this.throttle = 0;
        this.speed = 0;
        this.altitude = 3.5;
        this.heading = 0;
        this.verticalSpeed = 0;
        this.gForce = 1.0;
        this.gearDown = true;
        this.flapAngle = 0;
        this.braking = false;
        this.onGround = true;
        if (this.model) {
            this.model.position.copy(this.position);
            this.model.quaternion.identity();
        }
    }

    update(dt, input, terrainManager) {
        if (dt > 0.1) dt = 0.1; // Clamp delta

        // Control rates
        const pitchRate = 1.5 * this.pitchSpeedMultiplier;
        const rollRate = 2.5 * this.rollSpeedMultiplier;
        const yawRate = 0.8 * this.pitchSpeedMultiplier;

        // Apply control inputs as rotation
        const pitchDelta = input.pitch * pitchRate * dt;
        const rollDelta = input.roll * rollRate * dt;
        const yawDelta = input.yaw * yawRate * dt;

        // Get current orientation axes
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

        // Apply rotations
        const rotQ = new THREE.Quaternion();
        if (pitchDelta !== 0) {
            rotQ.setFromAxisAngle(right, pitchDelta);
            this.quaternion.premultiply(rotQ);
        }
        if (rollDelta !== 0) {
            rotQ.setFromAxisAngle(forward, rollDelta);
            this.quaternion.premultiply(rotQ);
        }
        if (yawDelta !== 0) {
            rotQ.setFromAxisAngle(up, yawDelta);
            this.quaternion.premultiply(rotQ);
        }
        this.quaternion.normalize();

        // Recalculate axes after rotation
        forward.set(0, 0, -1).applyQuaternion(this.quaternion);
        right.set(1, 0, 0).applyQuaternion(this.quaternion);
        up.set(0, 1, 0).applyQuaternion(this.quaternion);

        // Thrust
        const thrust = this.throttle * this.maxThrust;
        const thrustForce = forward.clone().multiplyScalar(thrust);

        // Airspeed
        this.speed = this.velocity.length();

        // Angle of attack (simplified)
        if (this.speed > 1) {
            const velDir = this.velocity.clone().normalize();
            this.angleOfAttack = Math.asin(THREE.MathUtils.clamp(
                -velDir.dot(up), -1, 1
            ));
        }

        // Dynamic pressure
        const airDensity = 1.225 * Math.exp(-this.altitude / 10000); // decreases with altitude
        const dynamicPressure = 0.5 * airDensity * this.speed * this.speed;

        // Lift
        const aoaFactor = Math.sin(this.angleOfAttack * 2) * 2;
        const flapLift = 1 + this.flapAngle / 60; // Flaps increase lift
        let liftMag = dynamicPressure * this.wingArea * this.liftCoeff * aoaFactor * flapLift;

        // Stall effect
        if (Math.abs(this.angleOfAttack) > 0.3) {
            liftMag *= Math.max(0, 1 - (Math.abs(this.angleOfAttack) - 0.3) * 3);
        }

        const liftForce = up.clone().multiplyScalar(liftMag);

        // Drag
        const dragBase = this.dragCoeff * (1 + (this.gearDown ? 0.03 : 0) + this.flapAngle / 200);
        const inducedDrag = (aoaFactor * aoaFactor) / (Math.PI * 8); // Aspect ratio ≈ 8
        const totalDragCoeff = dragBase + inducedDrag;
        const dragMag = dynamicPressure * this.wingArea * totalDragCoeff;
        const dragForce = this.speed > 0.1
            ? this.velocity.clone().normalize().multiplyScalar(-dragMag)
            : new THREE.Vector3();

        // Gravity
        const gravity = new THREE.Vector3(0, -this.mass * 9.81, 0);

        // Total force
        const totalForce = new THREE.Vector3()
            .add(thrustForce)
            .add(liftForce)
            .add(dragForce)
            .add(gravity);

        // Braking (ground only)
        if (this.braking && this.onGround && this.speed > 0.5) {
            const brakeForce = this.velocity.clone().normalize().multiplyScalar(-this.mass * 5);
            totalForce.add(brakeForce);
        }

        // Integration
        const accel = totalForce.divideScalar(this.mass);
        this.gForce = accel.length() / 9.81;
        this.velocity.addScaledVector(accel, dt);

        // Speed limits
        if (this.speed > this.maxSpeed) {
            this.velocity.multiplyScalar(this.maxSpeed / this.speed);
        }

        // Update position
        this.position.addScaledVector(this.velocity, dt);

        // Ground collision
        const groundHeight = terrainManager ? terrainManager.getHeightAt(this.position.x, this.position.z) : 0;
        const gearOffset = this.gearDown ? 3.5 : 1.5;

        if (this.position.y < groundHeight + gearOffset) {
            this.position.y = groundHeight + gearOffset;
            this.onGround = true;

            // Kill vertical velocity
            if (this.velocity.y < -15 && !this.onGround) {
                // Hard crash
                return 'crash';
            }
            if (this.velocity.y < 0) {
                this.velocity.y = 0;
            }

            // Ground friction
            if (!this.braking) {
                // フレームレートに依存しない摩擦計算 (1秒間に約12%減速)
                this.velocity.multiplyScalar(Math.pow(0.88, dt));
            }

            // Prevent flipping on ground - level out gradually
            const worldUp = new THREE.Vector3(0, 1, 0);
            const currentUp = up.clone();
            const correction = currentUp.lerp(worldUp, dt * 2).normalize();
            // Reconstruct quaternion to level the aircraft on ground
            const correctionQ = new THREE.Quaternion().setFromUnitVectors(up, correction);
            this.quaternion.premultiply(correctionQ);
            this.quaternion.normalize();
        } else {
            this.onGround = false;
        }

        // Update derived values
        this.altitude = this.position.y;
        this.verticalSpeed = this.velocity.y;
        this.heading = Math.atan2(-forward.x, -forward.z) * (180 / Math.PI);
        if (this.heading < 0) this.heading += 360;

        // Update model
        if (this.model) {
            this.model.position.copy(this.position);
            this.model.quaternion.copy(this.quaternion);

            // Gear visibility
            if (this.gearGroup) {
                this.gearGroup.visible = this.gearDown;
            }

            // Propeller spin
            if (this.propeller) {
                this.propAngle += this.throttle * 30 * dt;
                this.propeller.rotation.z = this.propAngle;
            }
        }

        // Crash detection
        if (this.position.y < -10) return 'crash';

        return 'ok';
    }

    // Speed in knots (1 m/s ≈ 1.944 knots)
    get speedKnots() { return this.speed * 1.944; }

    // Altitude in feet (1 m ≈ 3.281 ft)
    get altitudeFeet() { return this.altitude * 3.281; }

    // Vertical speed in ft/min
    get verticalSpeedFPM() { return this.verticalSpeed * 196.85; }
}
