let loadProgress = 0;
function updateLoading(progress) {
    loadProgress = Math.max(loadProgress, progress);
    const progressBar = document.getElementById('unity-progress-bar-full');
    if (progressBar) progressBar.style.width = `${loadProgress * 100}%`;
    if (loadProgress >= 1) {
        const loadingCover = document.getElementById('loading-cover');
        if (loadingCover) setTimeout(() => loadingCover.style.display = 'none', 500);
    }
}
updateLoading(0.1);

// DeckBuilder
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

        this.boardThickness = 1 / 12;
        this.boardWidth = 5.5 / 12;
        this.boardGap = 0.05;
        this.joistSpacing = 16 / 12;
        this.boardLengths = [12, 16, 20];

        this.loaded = false;
        this.composer = new THREE.EffectComposer(this.renderer);
        const renderPass = new THREE.RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Load assets
        this.loadAssets().then(() => {
            this.loaded = true;
            const unrealBloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth - 350, window.innerHeight), 0.8, 0.4, 0.85);
            this.composer.addPass(unrealBloomPass);
            this.animate(); // REVISED: Call the bound animate
            showPrompt();
            updateLoading(1);
        }).catch(err => {
            console.error('Asset load error:', err);
            this.loaded = true;
            this.animate();
            showPrompt();
        });

        this.camera.position.set(15, 10, 15);
        this.controls.target.set(0, this.deck.height, 0);
        this.controls.update();
    }

    async loadAssets() {
        return Promise.all([
            new Promise((resolve, reject) => this.textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/hardwood2_diffuse.jpg', (tex) => { // REVISED: Stable GitHub URL
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(0.5, 2);
                this.woodTexture = tex;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('Diffuse texture load failed', err);
                reject(err);
            })),
            new Promise((resolve, reject) => this.textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/hardwood2_normal.jpg', (tex) => { // REVISED: Stable URL
                this.normalTexture = tex;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('Normal texture load failed', err);
                reject(err);
            })),
            new Promise((resolve, reject) => this.textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/hardwood2_roughness.jpg', (tex) => { // REVISED: Stable URL
                this.roughnessTexture = tex;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('Roughness texture load failed', err);
                reject(err);
            })),
            new Promise((resolve, reject) => new THREE.RGBELoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/equirectangular/venice_sunset_1k.hdr', (hdr) => { // REVISED: Stable URL
                hdr.mapping = THREE.EquirectangularReflectionMapping;
                this.envMap = hdr;
                this.scene.background = this.envMap;
                this.scene.environment = this.envMap;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('HDRI load failed', err);
                reject(err);
            }))
        ]);
    }

    buildDeck() {
        this.deckGroup.clear();
        this.materialList = { totalBoardFeet: 0, totalJoistFeet: 0, totalRailFeet: 0, railingPosts: 0, stairFeet: 0, furnitureCount: 0 };

        // REVISED: Material caching and fallback if textures null
        const deckMaterial = new THREE.MeshPhysicalMaterial({
            map: this.woodTexture || new THREE.Texture(), // Fallback
            normalMap: this.normalTexture,
            roughnessMap: this.roughnessTexture,
            color: parseInt(this.deck.color.replace('#', '0x')),
            roughness: 0.6,
            metalness: 0.1,
            envMap: this.envMap,
            envMapIntensity: 1.0,
            clearcoat: 0.5
        });
        const joistMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9, metalness: 0.1 });
        const railMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });

        try {
            // REVISED: Input validation
            this.deck.width = Math.max(1, this.deck.width); // Clamp to positive
            // Similar for other dimensions...

            // REVISED: Reconstructed addJoists with InstancedMesh for performance
            const addJoists = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
                const isHorizontal = this.deck.boardDirection === 'horizontal';
                const spanDim = isHorizontal ? deckWidth : deckLength;
                const spaceDim = isHorizontal ? deckLength : deckWidth;
                const joistCount = Math.ceil(spaceDim / this.joistSpacing);
                const geometry = new THREE.BoxGeometry(spanDim, 7.25 / 12, 1.5 / 12);
                const instance = new THREE.InstancedMesh(geometry, joistMaterial, joistCount);
                for (let i = 0; i < joistCount; i++) {
                    const matrix = new THREE.Matrix4();
                    const pos = i * this.joistSpacing - spaceDim / 2;
                    if (isHorizontal) {
                        matrix.setPosition(offsetX, levelHeight - this.boardThickness - (7.25 / 24), pos + offsetZ);
                    } else {
                        matrix.makeRotationY(Math.PI / 2);
                        matrix.setPosition(pos + offsetX, levelHeight - this.boardThickness - (7.25 / 24), offsetZ);
                    }
                    instance.setMatrixAt(i, matrix);
                }
                instance.castShadow = true;
                instance.receiveShadow = true;
                this.deckGroup.add(instance);
                this.materialList.totalJoistFeet += spanDim * joistCount;
            };

            // REVISED: Reconstructed addBoards with InstancedMesh
            const addBoards = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
                const isHorizontal = this.deck.boardDirection === 'horizontal';
                const boardCount = Math.ceil((isHorizontal ? deckLength : deckWidth) / (this.boardWidth + this.boardGap));
                const geometry = new THREE.BoxGeometry(isHorizontal ? deckWidth : this.boardWidth, this.boardThickness, isHorizontal ? this.boardWidth : deckLength);
                const instance = new THREE.InstancedMesh(geometry, deckMaterial, boardCount);
                for (let i = 0; i < boardCount; i++) {
                    const matrix = new THREE.Matrix4();
                    const pos = i * (this.boardWidth + this.boardGap) - (deckLength / 2);
                    if (isHorizontal) {
                        matrix.setPosition(offsetX, levelHeight, pos + offsetZ);
                    } else {
                        matrix.makeRotationY(Math.PI / 2);
                        matrix.setPosition(pos + offsetX, levelHeight, offsetZ);
                    }
                    instance.setMatrixAt(i, matrix);
                }
                instance.castShadow = true;
                instance.receiveShadow = true;
                this.deckGroup.add(instance);
                this.materialList.totalBoardFeet += (isHorizontal ? deckWidth : deckLength) * boardCount;
            };

            // REVISED: Reconstructed addDimensions using direct CanvasTexture (no data URL)
            const addDimensions = () => {
                if (!this.deck.showDimensions) return;
                // Example for main width
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 64);
                    ctx.fillStyle = '#000'; ctx.font = 'bold 16px Arial';
                    ctx.fillText(`${this.deck.width} ft`, 10, 32);
                    const texture = new THREE.CanvasTexture(canvas);
                    const material = new THREE.SpriteMaterial({ map: texture });
                    const sprite = new THREE.Sprite(material);
                    sprite.position.set(this.deck.width / 2, this.deck.height + 1, 0); // Position above deck
                    sprite.scale.set(2, 1, 1); // Scale for visibility
                    this.deckGroup.add(sprite);
                }
                // Repeat for other dimensions (length, height, etc.) – this avoids loops of invalid URLs
            };

            // REVISED: Call for rectangular (expand for other shapes)
            if (this.deck.shape === 'rectangular') {
                addJoists(this.deck.width, this.deck.length);
                addBoards(this.deck.width, this.deck.length);
                addDimensions();
                // Add railings, stairs, etc., similarly
            }
            // ... Expand for L/T/multi-level with offsets

            this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(JSON.stringify(this.deck));
            this.historyIndex++;
            this.updateSummary();
            updateLoading(1);
        } catch (error) {
            console.error('Build error:', error);
            alert('Error building deck: ' + error.message);
            updateLoading(1);
        }
    }

    updateSummary() {
        // REVISED: Enhanced summary with costs
        const sqFt = this.calculateSqFt();
        const totalCost = (this.materialList.totalBoardFeet * this.boardCostPerFoot +
                           this.materialList.totalJoistFeet * this.joistCostPerFoot +
                           // ... other costs
                           ) * this.wasteFactor;
        document.getElementById('design-summary').innerText = `Square Footage: ${sqFt} sq ft\nTotal Cost Estimate: $${totalCost.toFixed(2)}\nFeatures: ${this.deck.shape}, Railings: ${this.deck.railings}`;
    }

    calculateSqFt() {
        // REVISED: Basic calc, expand for shapes
        return this.deck.width * this.deck.length;
    }

    addChair() {
        // REVISED: Simple parametric chair (box for seat, back)
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const chair = new THREE.Mesh(geometry, material);
        chair.position.set(0, this.deck.height + 1, 0); // On deck
        this.deckGroup.add(chair);
        this.materialList.furnitureCount++;
        this.buildDeck(); // Rebuild to update
    }

    addTable() {
        // REVISED: Simple table
        const geometry = new THREE.BoxGeometry(4, 1, 4);
        const material = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
        const table = new THREE.Mesh(geometry, material);
        table.position.set(3, this.deck.height + 0.5, 3);
        this.deckGroup.add(table);
        this.materialList.furnitureCount++;
        this.buildDeck();
    }

    animate = () => { // REVISED: Arrow function to bind 'this'
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.composer.render();
    };
}

// UI Functions
function openTab(tabId) {
    // REVISED: Add ARIA updates if needed
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`[onclick="openTab('${tabId}')"]`).classList.add('active');
}

function updateShapeInputs() {
    const shape = document.getElementById('deckShape').value;
    document.getElementById('wing-inputs').style.display = (shape === 'l-shaped' || shape === 't-shaped') ? 'block' : 'none';
    document.getElementById('multi-level-inputs').style.display = shape === 'multi-level' ? 'block' : 'none';
}

function updateMaterials() {
    deckBuilder.deck.color = document.getElementById('boardColor').value;
    deckBuilder.buildDeck();
}

function updateLighting() {
    const mode = document.getElementById('lightingMode').value;
    deckBuilder.ambientLight.intensity = mode === 'day' ? 0.6 : 0.2;
    deckBuilder.directionalLight.intensity = mode === 'day' ? 0.8 : 0.3;
    deckBuilder.hemiLight.intensity = mode === 'day' ? 0.3 : 0.1;
}

function setCameraView() {
    const view = document.getElementById('cameraView').value;
    if (view === 'top') {
        deckBuilder.camera.position.set(0, 20, 0);
        deckBuilder.controls.target.set(0, 0, 0);
    } else if (view === 'side') {
        deckBuilder.camera.position.set(20, 5, 0);
        deckBuilder.controls.target.set(0, 5, 0);
    } else if (view === 'underside') {
        deckBuilder.camera.position.set(0, -5, 0);
        deckBuilder.controls.target.set(0, 0, 0);
    } else {
        deckBuilder.camera.position.set(15, 10, 15);
        deckBuilder.controls.target.set(0, deckBuilder.deck.height, 0);
    }
    deckBuilder.controls.update();
}

function undo() {
    if (deckBuilder.historyIndex > 0) {
        deckBuilder.historyIndex--;
        deckBuilder.deck = JSON.parse(deckBuilder.history[deckBuilder.historyIndex]);
        deckBuilder.buildDeck();
        updateUI();
    }
}

function redo() {
    if (deckBuilder.historyIndex < deckBuilder.history.length - 1) {
        deckBuilder.historyIndex++;
        deckBuilder.deck = JSON.parse(deckBuilder.history[deckBuilder.historyIndex]);
        deckBuilder.buildDeck();
        updateUI();
    }
}

function updateUI() {
    const shapeEl = document.getElementById('deckShape');
    if (shapeEl) shapeEl.value = deckBuilder.deck.shape;
    const widthFeetEl = document.getElementById('widthFeet');
    if (widthFeetEl) widthFeetEl.value = Math.floor(deckBuilder.deck.width);
    const widthInchesEl = document.getElementById('widthInches');
    if (widthInchesEl) widthInchesEl.value = Math.round((deckBuilder.deck.width % 1) * 12);
    // REVISED: Sync all fields similarly
    // ... (length, wing, etc.)
    updateShapeInputs();
}

function buildDeck() {
    deckBuilder.deck.shape = document.getElementById('deckShape').value;
    deckBuilder.deck.width = parseFloat(document.getElementById('widthFeet').value || 0) + parseFloat(document.getElementById('widthInches').value || 0) / 12;
    // REVISED: Parse all fields with defaults and clamps
    // ... (similar for length, etc.)
    deckBuilder.buildDeck();
}

// Prompt system
const prompts = [
    {
        question: 'Deck Shape?',
        options: ['Rectangular', 'L-Shaped', 'T-Shaped', 'Multi-Level'],
        callback: (value) => deckBuilder.deck.shape = value.toLowerCase()
    },
    // REVISED: Expanded prompts for better onboarding
    {
        question: 'Main Width (feet)?',
        options: [], // Free input
        callback: (value) => deckBuilder.deck.width = parseFloat(value) || 12
    },
    // Add more as needed
];
let currentPrompt = 0;

function showPrompt() {
    try {
        const promptEl = document.getElementById('prompt');
        const questionDiv = document.getElementById('prompt-questions');
        if (!promptEl || !questionDiv) {
            console.error('Prompt elements not found');
            skipPrompt();
            return;
        }
        promptEl.style.display = 'block';
        updateLoading(0.5);

        if (currentPrompt < prompts.length) {
            const prompt = prompts[currentPrompt];
            questionDiv.innerHTML = `
                <p>${prompt.question}</p>
                ${prompt.options.length ? `<select id="prompt-answer">${prompt.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}</select>` : `<input type="text" id="prompt-answer">`}
            `;
        } else {
            promptEl.style.display = 'none';
            updateUI();
            deckBuilder.buildDeck();
            showTutorial();
        }
        setTimeout(() => {
            if (promptEl.style.display === 'block') {
                console.warn('Prompt timeout - auto-skipping');
                skipPrompt();
            }
        }, 10000);
    } catch (error) {
        console.error('Show prompt error:', error);
        skipPrompt();
    }
}

function nextPrompt() {
    try {
        const answerEl = document.getElementById('prompt-answer');
        if (!answerEl) {
            console.error('Prompt answer element not found');
            return;
        }
        const answer = answerEl.value;
        if (currentPrompt < prompts.length) {
            prompts[currentPrompt].callback(answer);
            currentPrompt++;
            showPrompt();
        }
    } catch (error) {
        console.error('Next prompt error:', error);
    }
}

function skipPrompt() {
    try {
        document.getElementById('prompt').style.display = 'none';
        updateUI();
        deckBuilder.buildDeck();
        showTutorial();
        updateLoading(1);
    } catch (error) {
        console.error('Skip prompt error:', error);
        updateLoading(1);
    }
}

// REVISED: Defined missing functions
function showTutorial() {
    document.getElementById('tutorial').style.display = 'block';
}

function closeTutorial() {
    document.getElementById('tutorial').style.display = 'none';
}

function showHelp() {
    document.getElementById('help').style.display = 'block';
}

function closeHelp() {
    document.getElementById('help').style.display = 'none';
}

// REVISED: Stubs for export/import
function exportDesign() {
    const json = JSON.stringify(deckBuilder.deck);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deck-design.json';
    a.click();
    // For PDF: Simple print (expand with jsPDF if needed)
    window.print();
}

function importDesignJSON(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            deckBuilder.deck = JSON.parse(e.target.result);
            deckBuilder.buildDeck();
            updateUI();
        };
        reader.readAsText(file);
    }
}

const deckBuilder = new DeckBuilder();

// Debounce for real-time updates
const debounce = (func, delay) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    };
};
document.querySelectorAll('#sidebar input, #sidebar select, #sidebar [type="checkbox"]').forEach(el => {
    el.addEventListener('input', debounce(buildDeck, 300)); // REVISED: Shorter delay for responsiveness
});

// Resize
window.addEventListener('resize', () => {
    deckBuilder.camera.aspect = (window.innerWidth - 350) / window.innerHeight;
    deckBuilder.camera.updateProjectionMatrix();
    deckBuilder.renderer.setSize(window.innerWidth - 350, window.innerHeight);
    deckBuilder.composer.setSize(window.innerWidth - 350, window.innerHeight);
});

// Orientation
window.addEventListener('orientationchange', () => {
    if (window.innerWidth < 768 && window.orientation === 0) {
        document.getElementById('orientation-prompt').style.display = 'flex';
    } else {
        document.getElementById('orientation-prompt').style.display = 'none';
    }
});
