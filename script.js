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
            this.animate();
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
            new Promise((resolve, reject) => this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_diffuse.jpg', (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(0.5, 2);
                this.woodTexture = tex;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('Diffuse texture load failed', err);
                reject(err);
            })),
            new Promise((resolve, reject) => this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_normal.jpg', (tex) => {
                this.normalTexture = tex;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('Normal texture load failed', err);
                reject(err);
            })),
            new Promise((resolve, reject) => this.textureLoader.load('https://threejs.org/examples/textures/hardwood2_roughness.jpg', (tex) => {
                this.roughnessTexture = tex;
                updateLoading(0.2);
                resolve();
            }, undefined, (err) => {
                console.error('Roughness texture load failed', err);
                reject(err);
            })),
            new Promise((resolve, reject) => new THREE.RGBELoader().load('https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr', (hdr) => {
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

        const deckMaterial = new THREE.MeshPhysicalMaterial({
            map: this.woodTexture,
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

        // addJoists function (with fixes)
        const addJoists = (deckWidth, deckLength, offsetX = 0, offsetZ = 0, levelHeight = this.deck.height) => {
            const isHorizontal = this.deck.boardDirection === 'horizontal';
            const spanDim = isHorizontal ? deckWidth : deckLength;
            const spaceDim = isHorizontal ? deckLength : deckWidth;
            let joistCount = Math.ceil(spaceDim / this.joistSpacing);
            if ((spaceDim % this.joistSpacing) < 0.5) joistCount--;
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
            // Rim joists and posts (unchanged from history)
            // ... (omit for brevity, but include in full code)
        };

        // addBoards, addPictureFrame, addRailings, addStairs, addDimensions (unchanged from history, with cylinder fixes, etc.)
        // addChair, addTable (as buttons call deckBuilder.addChair, etc.)

        try {
            // Shape-specific builds (call addJoists, addBoards, etc.)
            // ... (full logic from history)
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
        // ... (full summary with sqFt, cost, features from history)
    }

    calculateSqFt() {
        // ... (from history)
    }

    addChair() {
        // ... (parametric mesh from history)
        this.buildDeck(); // Rebuild to update
    }

    addTable() {
        // ... (parametric mesh from history)
        this.buildDeck();
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.controls.update();
        this.composer.render();
    }
}

// UI Functions
function openTab(tabId) {
    // ... (from history)
}

function updateShapeInputs() {
    // ... (from history)
}

function updateMaterials() {
    deckBuilder.deck.color = document.getElementById('boardColor').value;
    deckBuilder.buildDeck();
}

function updateLighting() {
    // ... (adjust intensities from history)
}

function setCameraView() {
    // ... (from history, with underside flipping camera below deck)
}

function undo() {
    // ... (from history)
}

function redo() {
    // ... (from history)
}

function updateUI() {
    const shapeEl = document.getElementById('deckShape');
    if (shapeEl) shapeEl.value = deckBuilder.deck.shape;
    const widthFeetEl = document.getElementById('widthFeet');
    if (widthFeetEl) widthFeetEl.value = Math.floor(deckBuilder.deck.width);
    const widthInchesEl = document.getElementById('widthInches');
    if (widthInchesEl) widthInchesEl.value = Math.round((deckBuilder.deck.width % 1) * 12);
    // ... (full sync for all fields)
    updateShapeInputs();
}

function buildDeck() {
    deckBuilder.deck.shape = document.getElementById('deckShape').value;
    deckBuilder.deck.width = parseFloat(document.getElementById('widthFeet').value || 0) + parseFloat(document.getElementById('widthInches').value || 0) / 12;
    // ... (full parse for all fields)
    deckBuilder.buildDeck();
}

// Prompt system
const prompts = [
    {
        question: 'Deck Shape?',
        options: ['Rectangular', 'L-Shaped', 'T-Shaped', 'Multi-Level'],
        callback: (value) => deckBuilder.deck.shape = value.toLowerCase()
    },
    // ... (add more as needed)
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
                <select id="prompt-answer">
                    ${prompt.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
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

// ... (showTutorial, closeTutorial, showHelp, closeHelp, exportDesign, importDesignJSON from history)

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
    el.addEventListener('input', debounce(buildDeck, 500));
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
