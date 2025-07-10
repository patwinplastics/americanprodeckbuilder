/* global THREE */

// DeckBuilder class with all updates
class DeckBuilder {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);
        this.camera = new THREE.PerspectiveCamera(75, (window.innerWidth - 350) / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth - 350, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lighting
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(this.ambientLight);
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(15, 20, 10);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.left = -20;
        this.directionalLight.shadow.camera.right = 20;
        this.directionalLight.shadow.camera.top = 20;
        this.directionalLight.shadow.camera.bottom = -20;
        this.scene.add(this.directionalLight);
        this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x228B22, 0.3);
        this.scene.add(this.hemiLight);

        // Sky and Ground
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        ground.receiveShadow = true;
        this.scene.add(ground);

        this.deckGroup = new THREE.Group();
        this.scene.add(this.deckGroup);

        this.deck = {
            shape: 'rectangular',
            width: 12,
            length: 12,
            wingWidth: 6,
            wingLength: 6,
            secondWidth: 6,
            secondLength: 6,
            secondHeightOffset: 1,
            height: 1,
            boardLength: 'auto',
            boardDirection: 'horizontal',
            boardPattern: 'standard',
            pictureFrame: false,
            railings: false,
            stairs: false,
            stairSteps: 3,
            stairWidth: 4,
            stairType: 'straight',
            railingStyle: 'standard',
            showDimensions: true,
            color: '#8b4513'
        };

        this.history = [];
        this.historyIndex = -1;
        this.materialList = { totalBoardFeet: 0, totalJoistFeet: 0, totalRailFeet: 0, railingPosts: 0, stairFeet: 0, furnitureCount: 0 };
        this.boardCostPerFoot = 4;
        this.joistCostPerFoot = 2;
        this.railCostPerFoot = 3;
        this.railingPostCost = 50;
        this.stairCostPerStep = 50;
        this.furnitureCostPerItem = 100;
        this.wasteFactor = 1.05;

        this.textureLoader = new THREE.TextureLoader();
        this.woodTexture = null;
        this.normalTexture = null;
        this.roughnessTexture = null;
        this.envMap = null;
        this.loadAssets(); // Combined loading for textures/HDR

        this.boardThickness = 1 / 12;
        this.boardWidth = 5.5 / 12;
        this.boardGap = 0.05;
        this.joistSpacing = 16 / 12;
        this.boardLengths = [12, 16, 20];

        this.composer = new THREE.EffectComposer(this.renderer);
        const renderPass = new THREE.RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);
        const bloomPass = new THREE.BloomPass(1.5, 15, 4, 512);
        this.composer.addPass(bloomPass);

        this.camera.position.set(15, 10, 15);
        this.controls.target.set(0, this.deck.height, 0);
        this.controls.update();

        this.animate = this.animate.bind(this);
        this.animate();
    }

    loadAssets() {
        // High-res wood textures for PBR
        this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_diffuse.jpg', (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(0.5, 2);
            this.woodTexture = tex;
            updateLoading(0.2);
        });
        this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_normal.jpg', (tex) => {
            this.normalTexture = tex;
            updateLoading(0.2);
        });
        this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_roughness.jpg', (tex) => {
            this.roughnessTexture = tex;
            updateLoading(0.2);
        });
        // HDRI for env map
        new THREE.RGBELoader().load('https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr', (hdr) => {
            hdr.mapping = THREE.EquirectangularReflectionMapping;
            this.envMap = hdr;
            this.scene.background = this.envMap;
            this.scene.environment = this.envMap;
            updateLoading(0.2);
            this.buildDeck();
        });
    }

    buildDeck() {
        this.deckGroup.clear();
        this.materialList = { totalBoardFeet: 0, totalJoistFeet: 0, totalRailFeet: 0, railingPosts: 0, stairFeet: 0, furnitureCount: 0 };

        const deckMaterial = new THREE.MeshPhysicalMaterial({ // Upgraded to Physical for better PBR
            map: this.woodTexture,
            normalMap: this.normalTexture,
            roughnessMap: this.roughnessTexture,
            color: parseInt(this.deck.color.replace('#', '0x')),
            roughness: 0.6,
            metalness: 0.1,
            envMap: this.envMap,
            envMapIntensity: 1.0,
            clearcoat: 0.5 // For glossy wood
        });
        const joistMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9, metalness: 0.1 });
        const railMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });

        // Joists with fix
        const addJoists = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const isHorizontal = this.deck.boardDirection === 'horizontal';
            const spanDim = isHorizontal ? deckWidth : deckLength;
            const spaceDim = isHorizontal ? deckLength : deckWidth;
            let joistCount = Math.ceil(spaceDim / this.joistSpacing);
            if ((spaceDim % this.joistSpacing) < 0.5) joistCount--; // Fix oddball
            for (let i = 0; i < joistCount; i++) {
                const pos = i * this.joistSpacing - spaceDim / 2;
                const joistGeometry = new THREE.BoxGeometry(spanDim, 7.25 / 12, 1.5 / 12);
                const joist = new THREE.Mesh(joistGeometry, joistMaterial);
                if (isHorizontal) {
                    joist.position.set(offsetX, levelHeight - this.boardThickness - (7.25 / 24), pos + offsetZ);
                } else {
                    joist.rotation.y = Math.PI / 2;
                    joist.position.set(pos + offsetX, levelHeight - this.boardThickness - (7.25 / 24), offsetZ);
                }
                joist.castShadow = true;
                joist.receiveShadow = true;
                this.deckGroup.add(joist);
                this.materialList.totalJoistFeet += spanDim;
            }
            // Rim joists
            const rimGeometry = new THREE.BoxGeometry(spanDim, 7.25 / 12, 1.5 / 12);
            const rimFront = new THREE.Mesh(rimGeometry, joistMaterial);
            rimFront.position.set(offsetX, levelHeight - this.boardThickness - (7.25 / 24), -spaceDim / 2 + offsetZ);
            this.deckGroup.add(rimFront);
            this.materialList.totalJoistFeet += spanDim;
            const rimBack = rimFront.clone();
            rimBack.position.z = spaceDim / 2 + offsetZ;
            this.deckGroup.add(rimBack);
            this.materialList.totalJoistFeet += spanDim;
            // Supports (posts)
            const postSpacing = 8;
            const postCountAlongSpan = Math.floor(spanDim / postSpacing) + 1;
            const postCountAlongSpace = Math.floor(spaceDim / postSpacing) + 1;
            const postGeometry = new THREE.BoxGeometry(0.33, levelHeight, 0.33);
            for (let j = 0; j < postCountAlongSpan; j++) {
                for (let k = 0; k < postCountAlongSpace; k++) {
                    const postX = (j * postSpacing - spanDim / 2) + offsetX;
                    const postZ = (k * postSpacing - spaceDim / 2) + offsetZ;
                    const post = new THREE.Mesh(postGeometry, joistMaterial);
                    post.position.set(isHorizontal ? postX : postZ, levelHeight / 2 - this.boardThickness, isHorizontal ? postZ : postX);
                    this.deckGroup.add(post);
                    this.materialList.totalJoistFeet += levelHeight;
                }
            }
        };

        // Boards (unchanged but with PBR material)
        const addBoards = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            // ... (same as previous, accumulate totalBoardFeet)
        };

        // Picture frame (using addBoards for consistency)
        const addPictureFrame = (deckWidth, deckLength, levelHeight = this.deck.height, offsetX = 0, offsetZ = 0) => {
            // ... (same as previous)
        };

        // Railings with fix: cylinders, precise connections
        const addRailings = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const postSpacing = 6;
            const postRadius = 0.165;
            const railRadius = this.deck.railingStyle === 'cable' ? 0.02 : 0.05;
            const postGeometry = new THREE.CylinderGeometry(postRadius, postRadius, 3, 16);
            const railGeometry = new THREE.CylinderGeometry(railRadius, railRadius, postSpacing, 16);
            const postCountX = Math.floor(deckWidth / postSpacing) + 1;
            const postCountZ = Math.floor(deckLength / postSpacing) + 1;

            // Posts and rails along width
            for (let i = 0; i < postCountX; i++) {
                const x = i * postSpacing - deckWidth / 2 + offsetX;
                const postTop = new THREE.Mesh(postGeometry, railMaterial);
                postTop.position.set(x, levelHeight + 1.5, deckLength / 2 + offsetZ);
                this.deckGroup.add(postTop);
                this.materialList.railingPosts++;
                const postBottom = postTop.clone();
                postBottom.position.z = -deckLength / 2 + offsetZ;
                this.deckGroup.add(postBottom);
                this.materialList.railingPosts++;

                if (i < postCountX - 1) {
                    const railTop = new THREE.Mesh(railGeometry, railMaterial);
                    railTop.rotation.z = Math.PI / 2;
                    railTop.position.set(x + postSpacing / 2, levelHeight + 2.5, deckLength / 2 + offsetZ);
                    this.deckGroup.add(railTop);
                    this.materialList.totalRailFeet += postSpacing;
                    const railLow = railTop.clone();
                    railLow.position.y = levelHeight + 1;
                    this.deckGroup.add(railLow);
                    this.materialList.totalRailFeet += postSpacing;

                    // Bottom side
                    const railTopB = railTop.clone();
                    railTopB.position.z = -deckLength / 2 + offsetZ;
                    this.deckGroup.add(railTopB);
                    this.materialList.totalRailFeet += postSpacing;
                    const railLowB = railLow.clone();
                    railLowB.position.z = -deckLength / 2 + offsetZ;
                    this.deckGroup.add(railLowB);
                    this.materialList.totalRailFeet += postSpacing;
                }
            }

            // Sides
            for (let i = 1; i < postCountZ - 1; i++) {
                const z = i * postSpacing - deckLength / 2 + offsetZ;
                const postRight = new THREE.Mesh(postGeometry, railMaterial);
                postRight.position.set(deckWidth / 2 + offsetX, levelHeight + 1.5, z);
                this.deckGroup.add(postRight);
                this.materialList.railingPosts++;
                const postLeft = postRight.clone();
                postLeft.position.x = -deckWidth / 2 + offsetX;
                this.deckGroup.add(postLeft);
                this.materialList.railingPosts++;
            }

            for (let i = 0; i < postCountZ - 1; i++) {
                const z = i * postSpacing - deckLength / 2 + offsetZ;
                const railRightTop = new THREE.Mesh(railGeometry, railMaterial);
                railRightTop.rotation.x = Math.PI / 2;
                railRightTop.position.set(deckWidth / 2 + offsetX, levelHeight + 2.5, z + postSpacing / 2);
                this.deckGroup.add(railRightTop);
                this.materialList.totalRailFeet += postSpacing;
                const railRightLow = railRightTop.clone();
                railRightLow.position.y = levelHeight + 1;
                this.deckGroup.add(railRightLow);
                this.materialList.totalRailFeet += postSpacing;

                const railLeftTop = railRightTop.clone();
                railLeftTop.position.x = -deckWidth / 2 + offsetX;
                this.deckGroup.add(railLeftTop);
                this.materialList.totalRailFeet += postSpacing;
                const railLeftLow = railRightLow.clone();
                railLeftLow.position.x = -deckWidth / 2 + offsetX;
                this.deckGroup.add(railLeftLow);
                this.materialList.totalRailFeet += postSpacing;
            }
        };

        // Stairs: Procedural, straight or spiral
        const addStairs = (stairSteps, stairWidth, stairType, levelHeight = this.deck.height) => {
            const stepHeight = levelHeight / stairSteps;
            const stepDepth = 1;
            const positionZ = -this.deck.length / 2; // Default position
            const treadMaterial = deckMaterial.clone();
            if (stairType === 'straight') {
                for (let i = 0; i < stairSteps; i++) {
                    const treadGeo = new THREE.BoxGeometry(stairWidth, this.boardThickness, stepDepth);
                    const tread = new THREE.Mesh(treadGeo, treadMaterial);
                    tread.position.set(0, i * stepHeight, positionZ - i * stepDepth - stepDepth / 2);
                    this.deckGroup.add(tread);
                    this.materialList.stairFeet += stairWidth;
                    // Stringers
                    const stringerGeo = new THREE.BoxGeometry(0.15, (stairSteps - i) * stepHeight, stepDepth * stairSteps);
                    const stringerLeft = new THREE.Mesh(stringerGeo, joistMaterial);
                    stringerLeft.position.set(-stairWidth / 2 + 0.075, i * stepHeight / 2, positionZ - (stairSteps / 2) * stepDepth);
                    this.deckGroup.add(stringerLeft);
                    const stringerRight = stringerLeft.clone();
                    stringerRight.position.x = stairWidth / 2 - 0.075;
                    this.deckGroup.add(stringerRight);
                    this.materialList.totalJoistFeet += 2 * ((stairSteps - i) * stepHeight + stepDepth * stairSteps);
                }
            } else if (stairType === 'spiral') {
                const radius = stairWidth / 2;
                const curve = new THREE.CatmullRomCurve3([]);
                for (let i = 0; i < stairSteps; i++) {
                    curve.points.push(new THREE.Vector3(radius * Math.cos(i * Math.PI / 4), i * stepHeight, radius * Math.sin(i * Math.PI / 4)));
                }
                const stairGeo = new THREE.TubeGeometry(curve, stairSteps * 4, 0.1, 8, false); // Basic spiral
                const stair = new THREE.Mesh(stairGeo, treadMaterial);
                stair.position.set(0, 0, positionZ);
                this.deckGroup.add(stair);
                this.materialList.stairFeet += stairSteps * radius * 2; // Approx
            }
            if (this.deck.railings) addRailings(stairWidth, stepDepth * stairSteps, 0, positionZ - stepDepth * stairSteps / 2, 0);
        };

        // Furniture: Chair
        this.addChair = () => {
            const seatGeo = new THREE.BoxGeometry(1.5, 0.1, 1.5);
            const seat = new THREE.Mesh(seatGeo, deckMaterial);
            seat.position.set(2, this.deck.height + 1.5, 2);
            this.deckGroup.add(seat);
            const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8);
            for (let i = -0.75; i <= 0.75; i += 1.5) {
                for (let j = -0.75; j <= 0.75; j += 1.5) {
                    const leg = new THREE.Mesh(legGeo, joistMaterial);
                    leg.position.set(2 + i, this.deck.height + 0.75, 2 + j);
                    this.deckGroup.add(leg);
                }
            }
            this.materialList.furnitureCount++;
            this.buildDeck(); // Rebuild to update summary
        };

        // Furniture: Table (similar, box top with legs)
        this.addTable = () => {
            const topGeo = new THREE.BoxGeometry(4, 0.1, 2);
            const top = new THREE.Mesh(topGeo, deckMaterial);
            top.position.set(-2, this.deck.height + 2, -2);
            this.deckGroup.add(top);
            const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
            for (let i = -2; i <= 2; i += 4) {
                for (let j = -1; j <= 1; j += 2) {
                    const leg = new THREE.Mesh(legGeo, joistMaterial);
                    leg.position.set(-2 + i, this.deck.height + 1, -2 + j);
                    this.deckGroup.add(leg);
                }
            }
            this.materialList.furnitureCount++;
            this.buildDeck();
        };

        // Dimensions: Like competitor samples
        const addDimensions = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
            // Width line
            const widthPoints = [new THREE.Vector3(-deckWidth/2 + offsetX - 1, levelHeight + 0.1, offsetZ), new THREE.Vector3(deckWidth/2 + offsetX + 1, levelHeight + 0.1, offsetZ)];
            const widthLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(widthPoints), lineMaterial);
            this.deckGroup.add(widthLine);
            // Length line
            const lengthPoints = [new THREE.Vector3(offsetX, levelHeight + 0.1, -deckLength/2 + offsetZ - 1), new THREE.Vector3(offsetX, levelHeight + 0.1, deckLength/2 + offsetZ + 1)];
            const lengthLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(lengthPoints), lineMaterial);
            this.deckGroup.add(lengthLine);
            // Labels (use basic sprites for text)
            // Note: For production, use Troika-Text for better text
            const loader = new THREE.TextureLoader();
            loader.load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAYAAAD0eNT6AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5wMDFBYZ1QAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAAIElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAADwP6RAAAAAElFTkSuQmCC', (tex) => {
                // Placeholder; replace with actual text textures or library
            });
        };

        try {
            // Build logic for shapes (call addJoists, addBoards, etc. as previous)
            // Example for rectangular:
            if (this.deck.shape === 'rectangular') {
                addJoists(this.deck.width, this.deck.length);
                addBoards(this.deck.width, this.deck.length);
                if (this.deck.pictureFrame) addPictureFrame(this.deck.width, this.deck.length);
                if (this.deck.railings) addRailings(this.deck.width, this.deck.length);
                if (this.deck.stairs) addStairs(this.deck.stairSteps, this.deck.stairWidth, this.deck.stairType);
                if (this.deck.showDimensions) addDimensions(this.deck.width, this.deck.length);
            }
            // ... (similar for other shapes, with offsets)

            this.history.push(JSON.stringify(this.deck));
            this.historyIndex++;
            this.updateSummary();
            updateLoading(1);
        } catch (error) {
            console.error('Build error:', error);
            alert('Error: ' + error.message);
            updateLoading(1);
        }
    }

    updateSummary() {
        const sqFt = this.calculateSqFt();
        const totalCost = (this.materialList.totalBoardFeet * this.boardCostPerFoot + 
            this.materialList.totalJoistFeet * this.joistCostPerFoot + 
            this.materialList.totalRailFeet * this.railCostPerFoot + 
            this.materialList.railingPosts * this.railingPostCost + 
            this.materialList.stairFeet * this.boardCostPerFoot + // New
            this.materialList.furnitureCount * this.furnitureCostPerItem) * this.wasteFactor;

        document.getElementById('design-summary').innerText = `
... (expanded with stairs/furniture details, sqFt, cost)
        `;
    }

    // ... (other methods like undo, redo, export updated with new fields; calculateSqFt same)

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.composer.render();
    }
}

// Instantiate and UI functions (updated for new inputs, e.g., deck.stairs = document.getElementById('stairs').checked;)

const deckBuilder = new DeckBuilder();
// ... (rest of UI, prompt, etc. as previous, with debounced buildDeck calling deckBuilder.buildDeck())
