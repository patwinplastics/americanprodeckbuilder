/* global THREE */

// Improved DeckBuilder class for better state management
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

        // Lighting (unchanged)
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

        // Sky and Ground (unchanged)
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
            secondHeightOffset: 1, // New: configurable, default 1ft
            height: 1,
            boardLength: 'auto',
            boardDirection: 'horizontal',
            boardPattern: 'standard',
            pictureFrame: false,
            railings: false,
            color: '#8b4513'
        };

        this.history = [];
        this.historyIndex = -1;
        this.materialList = { totalBoardFeet: 0, totalJoistFeet: 0, totalRailFeet: 0, railingPosts: 0 };
        this.boardCostPerFoot = 4;
        this.joistCostPerFoot = 2; // New: per linear foot for accuracy
        this.railCostPerFoot = 3; // New
        this.railingPostCost = 50;
        this.wasteFactor = 1.05; // 5% waste

        this.textureLoader = new THREE.TextureLoader();
        this.woodTexture = null;
        this.loadTexture();

        this.boardThickness = 1 / 12;
        this.boardWidth = 5.5 / 12;
        this.boardGap = 0.05;
        this.joistSpacing = 16 / 12;
        this.boardLengths = [12, 16, 20];

        this.camera.position.set(15, 10, 15);
        this.controls.target.set(0, this.deck.height, 0);
        this.controls.update();

        this.animate = this.animate.bind(this);
        this.animate();
    }

    loadTexture() {
        this.textureLoader.load(
            'https://threejs.org/examples/textures/wood.jpg',
            (texture) => {
                this.woodTexture = texture;
                this.woodTexture.wrapS = this.woodTexture.wrapT = THREE.RepeatWrapping;
                this.woodTexture.repeat.set(0.5, 2);
                updateLoading(0.3);
                this.buildDeck();
            },
            undefined,
            (error) => {
                console.error('Texture load failed:', error);
                updateLoading(0.3);
                this.buildDeck();
            }
        );
    }

    buildDeck() {
        this.deckGroup.clear(); // Improved: use clear() for efficiency
        this.materialList = { totalBoardFeet: 0, totalJoistFeet: 0, totalRailFeet: 0, railingPosts: 0 };

        const deckMaterial = new THREE.MeshStandardMaterial({
            color: parseInt(this.deck.color.replace('#', '0x')),
            roughness: 0.8,
            metalness: 0.1,
            map: this.woodTexture || null
        });
        const joistMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9, metalness: 0.1 });
        const railMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });

        // Generalized addJoists: now adapts to boardDirection
        const addJoists = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const isHorizontal = this.deck.boardDirection === 'horizontal';
            const spanDim = isHorizontal ? deckWidth : deckLength; // Joist length = span perpendicular to boards
            const spaceDim = isHorizontal ? deckLength : deckWidth; // Spacing along board direction
            const joistCount = Math.floor(spaceDim / this.joistSpacing) + 1;
            for (let i = 0; i < joistCount; i++) {
                const pos = i * this.joistSpacing - spaceDim / 2;
                const joistGeometry = new THREE.BoxGeometry(spanDim, 7.25 / 12, 1.5 / 12);
                const joist = new THREE.Mesh(joistGeometry, joistMaterial);
                if (isHorizontal) {
                    joist.position.set(offsetX, levelHeight - this.boardThickness - (7.25 / 24), pos + offsetZ);
                } else {
                    joist.rotation.y = Math.PI / 2; // Rotate for vertical boards
                    joist.position.set(pos + offsetX, levelHeight - this.boardThickness - (7.25 / 24), offsetZ);
                }
                joist.castShadow = true;
                joist.receiveShadow = true;
                this.deckGroup.add(joist);
                this.materialList.totalJoistFeet += spanDim;
            }
            // Add supports/posts under joists (new feature: every 8ft)
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
                    this.materialList.totalJoistFeet += levelHeight; // Treat posts as joist material
                }
            }
        };

        // Improved addBoards: fix auto-optimize fallback, accumulate feet
        const addBoards = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const isHorizontal = this.deck.boardDirection === 'horizontal';
            const effectiveBoardWidth = this.boardWidth + this.boardGap;
            const boardCount = Math.ceil(isHorizontal ? deckWidth / effectiveBoardWidth : deckLength / effectiveBoardWidth);
            for (let i = 0; i < boardCount; i++) {
                const pos = i * effectiveBoardWidth - (isHorizontal ? deckWidth : deckLength) / 2 + this.boardWidth / 2;
                let remaining = isHorizontal ? deckLength : deckWidth;
                let coord = -(isHorizontal ? deckLength : deckWidth) / 2;
                while (remaining > 0) {
                    let availableLengths = this.boardLengths.filter(l => l <= remaining);
                    let lengthToUse = this.deck.boardLength === 'auto'
                        ? (availableLengths.length > 0 ? Math.max(...availableLengths) : Math.min(...this.boardLengths)) // Fallback: use smallest if all too big
                        : Math.min(parseFloat(this.deck.boardLength) / 12, remaining);
                    const boardGeometry = this.deck.boardPattern === 'diagonal'
                        ? new THREE.BoxGeometry(this.boardWidth * 1.414, this.boardThickness, lengthToUse * 1.414)
                        : new THREE.BoxGeometry(isHorizontal ? this.boardWidth : lengthToUse, this.boardThickness, isHorizontal ? lengthToUse : deckWidth);
                    const board = new THREE.Mesh(boardGeometry, deckMaterial);
                    if (this.deck.boardPattern === 'diagonal') {
                        board.rotation.y = Math.PI / 4;
                        board.position.set(pos + offsetX, levelHeight, coord + lengthToUse / 2 + offsetZ);
                    } else {
                        board.position.set(isHorizontal ? pos + offsetX : coord + lengthToUse / 2 + offsetX, levelHeight, isHorizontal ? coord + lengthToUse / 2 + offsetZ : pos + offsetZ);
                    }
                    board.castShadow = true;
                    board.receiveShadow = true;
                    this.deckGroup.add(board);
                    this.materialList.totalBoardFeet += lengthToUse;
                    coord += lengthToUse;
                    remaining -= lengthToUse;
                }
            }
        };

        // Improved addPictureFrame: add offsets, use addBoards-style for accurate counting
        const addPictureFrame = (deckWidth, deckLength, levelHeight = this.deck.height, offsetX = 0, offsetZ = 0) => {
            // Top and bottom frames (horizontal if boards horizontal, but simplify to rows)
            addBoards(deckWidth + 2 * this.boardWidth, this.boardWidth, offsetX, offsetZ + deckLength / 2 + this.boardWidth / 2, levelHeight); // Top
            addBoards(deckWidth + 2 * this.boardWidth, this.boardWidth, offsetX, offsetZ - deckLength / 2 - this.boardWidth / 2, levelHeight); // Bottom
            // Sides (adjust for no double-counting corners)
            addBoards(this.boardWidth, deckLength, offsetX + deckWidth / 2 + this.boardWidth / 2, offsetZ, levelHeight); // Right
            addBoards(this.boardWidth, deckLength, offsetX - deckWidth / 2 - this.boardWidth / 2, offsetZ, levelHeight); // Left
        };

        // Improved addRailings: add offsets, track feet and posts separately
        const addRailings = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const postSpacing = 6;
            const postGeometry = new THREE.BoxGeometry(0.33, 3, 0.33);
            const railHeightTop = levelHeight + 2.5;
            const railHeightLow = levelHeight + 1;
            const postCountX = Math.floor(deckWidth / postSpacing) + 1;
            const postCountZ = Math.floor(deckLength / postSpacing) + 1;

            // Posts and rails along width (top/bottom)
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
                    const railLength = postSpacing;
                    const railGeo = new THREE.BoxGeometry(railLength, 0.1, 0.1);
                    const railTop = new THREE.Mesh(railGeo, railMaterial);
                    railTop.position.set(x + postSpacing / 2, railHeightTop, deckLength / 2 + offsetZ);
                    this.deckGroup.add(railTop);
                    this.materialList.totalRailFeet += railLength;
                    const railLow = railTop.clone();
                    railLow.position.y = railHeightLow;
                    this.deckGroup.add(railLow);
                    this.materialList.totalRailFeet += railLength;

                    // Duplicate for bottom
                    const railTopBottom = railTop.clone();
                    railTopBottom.position.z = -deckLength / 2 + offsetZ;
                    this.deckGroup.add(railTopBottom);
                    this.materialList.totalRailFeet += railLength;
                    const railLowBottom = railLow.clone();
                    railLowBottom.position.z = -deckLength / 2 + offsetZ;
                    this.deckGroup.add(railLowBottom);
                    this.materialList.totalRailFeet += railLength;
                }
            }

            // Sides (left/right, excluding corners)
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
                const railLength = postSpacing;
                const railGeo = new THREE.BoxGeometry(0.1, 0.1, railLength);
                const railRightTop = new THREE.Mesh(railGeo, railMaterial);
                railRightTop.position.set(deckWidth / 2 + offsetX, railHeightTop, z + postSpacing / 2);
                this.deckGroup.add(railRightTop);
                this.materialList.totalRailFeet += railLength;
                const railRightLow = railRightTop.clone();
                railRightLow.position.y = railHeightLow;
                this.deckGroup.add(railRightLow);
                this.materialList.totalRailFeet += railLength;

                const railLeftTop = railRightTop.clone();
                railLeftTop.position.x = -deckWidth / 2 + offsetX;
                this.deckGroup.add(railLeftTop);
                this.materialList.totalRailFeet += railLength;
                const railLeftLow = railRightLow.clone();
                railLeftLow.position.x = -deckWidth / 2 + offsetX;
                this.deckGroup.add(railLeftLow);
                this.materialList.totalRailFeet += railLength;
            }
        };

        try {
            if (this.deck.shape === 'rectangular') {
                addJoists(this.deck.width, this.deck.length);
                addBoards(this.deck.width, this.deck.length);
                if (this.deck.pictureFrame) addPictureFrame(this.deck.width, this.deck.length);
                if (this.deck.railings) addRailings(this.deck.width, this.deck.length);
            } else if (this.deck.shape === 'l-shaped') {
                // Main
                addJoists(this.deck.width, this.deck.length);
                addBoards(this.deck.width, this.deck.length);
                // Wing
                const wingOffsetX = this.deck.width / 2 - this.deck.wingWidth / 2;
                const wingOffsetZ = -this.deck.length / 2 + this.deck.wingLength / 2;
                addJoists(this.deck.wingWidth, this.deck.wingLength, wingOffsetX, wingOffsetZ);
                addBoards(this.deck.wingWidth, this.deck.wingLength, wingOffsetX, wingOffsetZ);
                if (this.deck.pictureFrame) {
                    addPictureFrame(this.deck.width, this.deck.length);
                    addPictureFrame(this.deck.wingWidth, this.deck.wingLength, this.deck.height, wingOffsetX, wingOffsetZ);
                }
                if (this.deck.railings) {
                    addRailings(this.deck.width, this.deck.length);
                    addRailings(this.deck.wingWidth, this.deck.wingLength, wingOffsetX, wingOffsetZ);
                }
            } else if (this.deck.shape === 't-shaped') {
                // Main
                addJoists(this.deck.width, this.deck.length);
                addBoards(this.deck.width, this.deck.length);
                // Wing
                const wingOffsetX = 0;
                const wingOffsetZ = this.deck.length / 2 - this.deck.wingLength / 2;
                addJoists(this.deck.wingWidth, this.deck.wingLength, wingOffsetX, wingOffsetZ);
                addBoards(this.deck.wingWidth, this.deck.wingLength, wingOffsetX, wingOffsetZ);
                if (this.deck.pictureFrame) {
                    addPictureFrame(this.deck.width, this.deck.length);
                    addPictureFrame(this.deck.wingWidth, this.deck.wingLength, this.deck.height, wingOffsetX, wingOffsetZ);
                }
                if (this.deck.railings) {
                    addRailings(this.deck.width, this.deck.length);
                    addRailings(this.deck.wingWidth, this.deck.wingLength, wingOffsetX, wingOffsetZ);
                }
            } else if (this.deck.shape === 'multi-level') {
                // First level
                addJoists(this.deck.width, this.deck.length);
                addBoards(this.deck.width, this.deck.length);
                // Second level (configurable offset)
                const secondOffsetX = 0;
                const secondOffsetZ = this.deck.length / 2 - this.deck.secondLength / 2;
                const secondHeight = this.deck.height + this.deck.secondHeightOffset;
                addJoists(this.deck.secondWidth, this.deck.secondLength, secondOffsetX, secondOffsetZ, secondHeight);
                addBoards(this.deck.secondWidth, this.deck.secondLength, secondOffsetX, secondOffsetZ, secondHeight);
                if (this.deck.pictureFrame) {
                    addPictureFrame(this.deck.width, this.deck.length);
                    addPictureFrame(this.deck.secondWidth, this.deck.secondLength, secondHeight, secondOffsetX, secondOffsetZ);
                }
                if (this.deck.railings) {
                    addRailings(this.deck.width, this.deck.length);
                    addRailings(this.deck.secondWidth, this.deck.secondLength, secondOffsetX, secondOffsetZ, secondHeight);
                }
            }

            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(JSON.stringify(this.deck));
            this.historyIndex++;
            this.updateSummary();
            updateLoading(1);
        } catch (error) {
            console.error('Build error:', error);
            alert('Error building deck: ' + error.message); // New: user feedback
            updateLoading(1);
        }
    }

    updateSummary() {
        const totalCost = (this.materialList.totalBoardFeet * this.boardCostPerFoot +
            this.materialList.totalJoistFeet * this.joistCostPerFoot +
            this.materialList.totalRailFeet * this.railCostPerFoot +
            this.materialList.railingPosts * this.railingPostCost) * this.wasteFactor;

        // Improved summary with sq ft
        const sqFt = this.calculateSqFt(); // New method below
        document.getElementById('design-summary').innerText = `
Shape: ${this.deck.shape.charAt(0).toUpperCase() + this.deck.shape.slice(1)}
Width: ${Math.floor(this.deck.width)} ft ${Math.round((this.deck.width % 1) * 12)} in
Length: ${Math.floor(this.deck.length)} ft ${Math.round((this.deck.length % 1) * 12)} in
${this.deck.shape !== 'rectangular' ? `Wing Width: ${Math.floor(this.deck.wingWidth)} ft ${Math.round((this.deck.wingWidth % 1) * 12)} in\nWing Length: ${Math.floor(this.deck.wingLength)} ft ${Math.round((this.deck.wingLength % 1) * 12)} in` : ''}
${this.deck.shape === 'multi-level' ? `Second Level Width: ${Math.floor(this.deck.secondWidth)} ft ${Math.round((this.deck.secondWidth % 1) * 12)} in\nSecond Level Length: ${Math.floor(this.deck.secondLength)} ft ${Math.round((this.deck.secondLength % 1) * 12)} in\nSecond Level Offset: ${this.deck.secondHeightOffset} ft` : ''}
Height: ${this.deck.height} ft
Board Length: ${this.deck.boardLength === 'auto' ? 'Auto-Optimize' : this.deck.boardLength / 12 + ' ft'}
Board Direction: ${this.deck.boardDirection}
Board Pattern: ${this.deck.boardPattern}
Picture Frame: ${this.deck.pictureFrame ? 'Yes' : 'No'}
Railings: ${this.deck.railings ? 'Yes' : 'No'}
Color: ${document.getElementById('boardColor').options[document.getElementById('boardColor').selectedIndex].text}
Square Footage: ${sqFt.toFixed(2)} sq ft
Materials: ${this.materialList.totalBoardFeet.toFixed(2)} ft boards, ${this.materialList.totalJoistFeet.toFixed(2)} ft joists, ${this.materialList.totalRailFeet.toFixed(2)} ft rails, ${this.materialList.railingPosts} posts
Estimated Cost (incl. 5% waste): $${totalCost.toFixed(2)}
        `;
    }

    calculateSqFt() {
        let sqFt = this.deck.width * this.deck.length;
        if (this.deck.shape === 'l-shaped' || this.deck.shape === 't-shaped') sqFt += this.deck.wingWidth * this.deck.wingLength;
        if (this.deck.shape === 'multi-level') sqFt += this.deck.secondWidth * this.deck.secondLength;
        return sqFt;
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Instantiate
const deckBuilder = new DeckBuilder();

// UI functions updated to use deckBuilder.deck function calls
function buildDeck() {
    // Update deck from inputs (unchanged, but add secondHeightOffset input in HTML: <label>Second Height Offset: <input type="number" id="secondHeightOffset" min="1" value="1"> ft</label>)
    deckBuilder.deck.secondHeightOffset = parseFloat(document.getElementById('secondHeightOffset').value || 1);
    // ... (add to buildDeck() for other fields)
    deckBuilder.buildDeck(); // Renamed internal
}

// Real-time updates: debounce rebuild on input
const debounce = (func, delay) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    };
};
document.querySelectorAll('#sidebar input, #sidebar select, #sidebar checkbox').forEach(el => {
    el.addEventListener('input', debounce(buildDeck, 500));
});

// Expanded prompts (add dimension questions)
const prompts = [
    { question: 'Deck Shape?', options: ['Rectangular', 'L-Shaped', 'T-Shaped', 'Multi-Level'], callback: (v) => deckBuilder.deck.shape = v.toLowerCase() },
    { question: 'Main Width (ft)?', options: null, callback: (v) => deckBuilder.deck.width = parseFloat(v) }, // New: free input
    { question: 'Main Length (ft)?', options: null, callback: (v) => deckBuilder.deck.length = parseFloat(v) },
    // ... add more for wing, etc.
    // Original prompts...
];

// Import design (new)
function importDesignJSON(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                deckBuilder.deck = JSON.parse(e.target.result).deck;
                updateUI();
                deckBuilder.buildDeck();
            } catch (err) {
                alert('Invalid JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
    }
}

// Other functions (update to deckBuilder.deck, e.g., updateMaterials, etc.)
// ... (adjust as per original, replacing 'deck' with 'deckBuilder.deck')

// Export updated with new fields (add to exportDesign latexContent)
 // ... add \item Square Footage: ${sqFt.toFixed(2)} sq ft etc.
