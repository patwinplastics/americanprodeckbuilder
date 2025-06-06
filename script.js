/* global THREE */

// Three.js Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);
const camera = new THREE.PerspectiveCamera(75, (window.innerWidth - 350) / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth - 350, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Orbit Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(15, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x228B22, 0.3);
scene.add(hemiLight);

// Sky
const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
const skyMaterial = new THREE.MeshBasicMaterial({
    color: 0x87ceeb,
    side: THREE.BackSide,
    vertexColors: false
});
const sky = new THREE.Mesh(skyGeometry, skyMaterial);
scene.add(sky);

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

// Deck Parameters
let deck = {
    shape: 'rectangular',
    width: 12,
    length: 12,
    wingWidth: 6,
    wingLength: 6,
    secondWidth: 6,
    secondLength: 6,
    height: 1,
    boardLength: 'auto',
    boardDirection: 'horizontal',
    boardPattern: 'standard',
    pictureFrame: false,
    railings: false,
    color: '#8b4513'
};

let deckGroup = new THREE.Group();
scene.add(deckGroup);
let history = [];
let historyIndex = -1;
let materialList = { boards: 0, joists: 0, railings: 0 };

// Wood Texture with Fallback
const textureLoader = new THREE.TextureLoader();
let woodTexture = null;
textureLoader.load(
    'https://threejs.org/examples/textures/wood.jpg',
    (texture) => {
        woodTexture = texture;
        woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
        woodTexture.repeat.set(0.5, 2);
        console.log('Wood texture loaded successfully');
        updateLoading(0.3);
        buildDeckInternal();
    },
    undefined,
    (error) => {
        console.error('Failed to load wood texture:', error);
        woodTexture = null;
        updateLoading(0.3);
        buildDeckInternal();
    }
);

// Loading Screen
let loadProgress = 0;
function updateLoading(progress) {
    loadProgress = Math.max(loadProgress, progress);
    const progressBar = document.getElementById('unity-progress-bar-full');
    if (progressBar) {
        progressBar.style.width = `${loadProgress * 100}%`;
    }
    if (loadProgress >= 1) {
        const loadingCover = document.getElementById('loading-cover');
        if (loadingCover) {
            setTimeout(() => loadingCover.style.display = 'none', 500);
        }
    }
}
updateLoading(0.1);

// Deck Construction
function buildDeckInternal() {
    while (deckGroup.children.length) {
        deckGroup.remove(deckGroup.children[0]);
    }

    const boardThickness = 1 / 12;
    const boardWidth = 5.5 / 12;
    const boardGap = 0.05;
    const joistSpacing = 16 / 12; // 16 inches in feet
    const boardLengths = [12, 16, 20];
    const deckHeight = deck.height;

    // Material with fallback
    const deckMaterial = new THREE.MeshStandardMaterial({
        color: parseInt(deck.color.replace('#', '0x')),
        roughness: 0.8,
        metalness: 0.1
    });
    if (woodTexture) {
        deckMaterial.map = woodTexture;
    } else {
        console.warn('Using fallback color for deck material due to texture loading failure');
    }
    deckMaterial.castShadow = true;

    const joistMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9, metalness: 0.1 });
    materialList = { boards: 0, joists: 0, railings: 0 };

    function addJoists(width, length, offsetX = 0, offsetZ = 0, height = deckHeight) {
        const joistCount = Math.floor(width / joistSpacing) + 1;
        console.log(`Adding ${joistCount} joists for width ${width} ft, length ${length} ft, offsetX ${offsetX}, offsetZ ${offsetZ}`);
        for (let i = 0; i < joistCount; i++) {
            const x = i * joistSpacing - (width / 2) + offsetX;
            const joistGeometry = new THREE.BoxGeometry(length, 7.25 / 12, 1.5 / 12);
            const joist = new THREE.Mesh(joistGeometry, joistMaterial);
            joist.position.set(x, height - boardThickness - (7.25 / 24), offsetZ);
            joist.castShadow = true;
            joist.receiveShadow = true;
            deckGroup.add(joist);
            materialList.joists++;
        }
    }

    function addBoards(width, length, offsetX = 0, offsetZ = 0, height = deckHeight, direction = deck.boardDirection, pattern = deck.boardPattern) {
        let boards = [];
        const effectiveBoardWidth = boardWidth + boardGap;
        const boardCount = Math.ceil(direction === 'horizontal' ? width / effectiveBoardWidth : length / effectiveBoardWidth);
        for (let i = 0; i < boardCount; i++) {
            const pos = i * effectiveBoardWidth - (direction === 'horizontal' ? width : length) / 2 + boardWidth / 2;
            let remaining = direction === 'horizontal' ? length : width;
            let coord = -(direction === 'horizontal' ? length : width) / 2;

            while (remaining > 0) {
                let lengthToUse = deck.boardLength === 'auto' ? Math.min(Math.max(...boardLengths.filter(l => l <= remaining)), remaining) : parseFloat(deck.boardLength) / 12;
                const boardGeometry = pattern === 'diagonal' ? new THREE.BoxGeometry(boardWidth * 1.414, boardThickness, lengthToUse * 1.414) : new THREE.BoxGeometry(direction === 'horizontal' ? boardWidth : lengthToUse, boardThickness, direction === 'horizontal' ? lengthToUse : width);
                const board = new THREE.Mesh(boardGeometry, deckMaterial);
                if (pattern === 'diagonal') {
                    board.rotation.y = Math.PI / 4;
                    board.position.set(pos + offsetX, height, coord + lengthToUse / 2 + offsetZ);
                } else {
                    board.position.set(direction === 'horizontal' ? pos + offsetX : coord + lengthToUse / 2 + offsetX, height, direction === 'horizontal' ? coord + lengthToUse / 2 + offsetZ : pos + offsetZ);
                }
                board.castShadow = true;
                board.receiveShadow = true;
                boards.push(board);
                deckGroup.add(board);
                materialList.boards++;
                coord += lengthToUse;
                remaining -= lengthToUse;
            }
        }
        return boards;
    }

    function addPictureFrame(width, length, height = deckHeight) {
        const effectiveBoardWidth = boardWidth + boardGap;
        const frameGeometry = new THREE.BoxGeometry(width + 2 * effectiveBoardWidth, boardThickness, boardWidth);
        const frameTop = new THREE.Mesh(frameGeometry, deckMaterial);
        frameTop.position.set(0, height, length / 2 + boardWidth / 2);
        frameTop.castShadow = true;
        deckGroup.add(frameTop);
        materialList.boards += Math.ceil((width + 2 * effectiveBoardWidth) / boardWidth);

        const frameBottom = frameTop.clone();
        frameBottom.position.z = -length / 2 - boardWidth / 2;
        deckGroup.add(frameBottom);
        materialList.boards += Math.ceil((width + 2 * effectiveBoardWidth) / boardWidth);

        const sideFrameGeometry = new THREE.BoxGeometry(boardWidth, boardThickness, length);
        const frameRight = new THREE.Mesh(sideFrameGeometry, deckMaterial);
        frameRight.position.set(width / 2 + boardWidth / 2, height, 0);
        frameRight.castShadow = true;
        deckGroup.add(frameRight);
        materialList.boards += Math.ceil(length / boardWidth);

        const frameLeft = frameRight.clone();
        frameLeft.position.x = -width / 2 - boardWidth / 2;
        deckGroup.add(frameLeft);
        materialList.boards += Math.ceil(length / boardWidth);
    }

    function addRailings(width, length, height = deckHeight) {
        const postGeometry = new THREE.BoxGeometry(0.33, 3, 0.33);
        const railGeometry = new THREE.BoxGeometry(0.1, 0.1, 1);
        const railMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.1 });
        const postSpacing = 6;
        const postCountX = Math.floor(width / postSpacing) + 1;
        const postCountZ = Math.floor(length / postSpacing) + 1;

        for (let i = 0; i < postCountX; i++) {
            const x = i * postSpacing - width / 2;
            const postTop = new THREE.Mesh(postGeometry, railMaterial);
            postTop.position.set(x, height + 1.5, length / 2);
            postTop.castShadow = true;
            deckGroup.add(postTop);
            materialList.railings++;

            const postBottom = postTop.clone();
            postBottom.position.z = -length / 2;
            deckGroup.add(postBottom);
            materialList.railings++;

            if (i < postCountX - 1) {
                const railLength = postSpacing;
                const rail = new THREE.Mesh(new THREE.BoxGeometry(railLength, 0.1, 0.1), railMaterial);
                rail.position.set(x + postSpacing / 2, height + 2.5, length / 2);
                deckGroup.add(rail);
                const railLower = rail.clone();
                railLower.position.y = height + 1;
                deckGroup.add(railLower);
            }
        }

        for (let i = 1; i < postCountZ - 1; i++) {
            const z = i * postSpacing - length / 2;
            const postRight = new THREE.Mesh(postGeometry, railMaterial);
            postRight.position.set(width / 2, height + 1.5, z);
            postRight.castShadow = true;
            deckGroup.add(postRight);
            materialList.railings++;

            const postLeft = postRight.clone();
            postLeft.position.x = -width / 2;
            deckGroup.add(postLeft);
            materialList.railings++;
        }

        for (let i = 0; i < postCountZ - 1; i++) {
            const z = i * postSpacing - length / 2;
            const railLength = postSpacing;
            const railRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, railLength), railMaterial);
            railRight.position.set(width / 2, height + 2.5, z + postSpacing / 2);
            deckGroup.add(railRight);
            const railRightLower = railRight.clone();
            railRightLower.position.y = height + 1;
            deckGroup.add(railRightLower);

            const railLeft = railRight.clone();
            railLeft.position.x = -width / 2;
            deckGroup.add(railLeft);
            const railLeftLower = railLeft.clone();
            railLeftLower.position.y = height + 1;
            deckGroup.add(railLeftLower);
        }
    }

    let allBoards = [];
    try {
        if (deck.shape === 'rectangular') {
            addJoists(deck.width, deck.length);
            allBoards = addBoards(deck.width, deck.length);
            if (deck.pictureFrame) addPictureFrame(deck.width, deck.length);
            if (deck.railings) addRailings(deck.width, deck.length);
        } else if (deck.shape === 'l-shaped') {
            // Main section
            addJoists(deck.width, deck.length);
            allBoards = allBoards.concat(addBoards(deck.width, deck.length));
            // Wing section
            const wingOffsetX = deck.width / 2 - (deck.wingWidth / 2);
            const wingOffsetZ = -(deck.length / 2) + (deck.wingLength / 2);
            addJoists(deck.wingWidth, deck.wingLength, wingOffsetX, wingOffsetZ);
            allBoards = allBoards.concat(addBoards(deck.wingWidth, deck.wingLength, wingOffsetX, wingOffsetZ));
            if (deck.pictureFrame) {
                addPictureFrame(deck.width, deck.length);
                addPictureFrame(deck.wingWidth, deck.wingLength, deck.height, wingOffsetX, wingOffsetZ);
            }
            if (deck.railings) {
                addRailings(deck.width, deck.length);
                addRailings(deck.wingWidth, deck.wingLength, wingOffsetX, wingOffsetZ);
            }
        } else if (deck.shape === 't-shaped') {
            // Main section
            addJoists(deck.width, deck.length);
            allBoards = allBoards.concat(addBoards(deck.width, deck.length));
            // Wing section (top of T)
            const wingOffsetX = 0;
            const wingOffsetZ = (deck.length / 2) - (deck.wingLength / 2);
            addJoists(deck.wingWidth, deck.wingLength, wingOffsetX, wingOffsetZ);
            allBoards = allBoards.concat(addBoards(deck.wingWidth, deck.wingLength, wingOffsetX, wingOffsetZ));
            if (deck.pictureFrame) {
                addPictureFrame(deck.width, deck.length);
                addPictureFrame(deck.wingWidth, deck.wingLength, deck.height, wingOffsetX, wingOffsetZ);
            }
            if (deck.railings) {
                addRailings(deck.width, deck.length);
                addRailings(deck.wingWidth, deck.wingLength, wingOffsetX, wingOffsetZ);
            }
        } else if (deck.shape === 'multi-level') {
            // First level
            addJoists(deck.width, deck.length);
            allBoards = allBoards.concat(addBoards(deck.width, deck.length));
            // Second level
            const secondOffsetX = 0;
            const secondOffsetZ = (deck.length / 2) - (deck.secondLength / 2);
            addJoists(deck.secondWidth, deck.secondLength, secondOffsetX, secondOffsetZ, deck.height + 1);
            allBoards = allBoards.concat(addBoards(deck.secondWidth, deck.secondLength, secondOffsetX, secondOffsetZ, deck.height + 1));
            if (deck.pictureFrame) {
                addPictureFrame(deck.width, deck.length);
                addPictureFrame(deck.secondWidth, deck.secondLength, deck.height + 1, secondOffsetX, secondOffsetZ);
            }
            if (deck.railings) {
                addRailings(deck.width, deck.length);
                addRailings(deck.secondWidth, deck.secondLength, secondOffsetX, secondOffsetZ, deck.height + 1);
            }
        }

        history = history.slice(0, historyIndex + 1);
        history.push(JSON.stringify(deck));
        historyIndex++;
        updateSummary();
        updateLoading(1);
    } catch (error) {
        console.error('Error building deck:', error);
        updateLoading(1);
    }
    console.log(`Total joists added: ${materialList.joists}`);
}

// Cost Estimation and Summary
function updateSummary() {
    const boardCostPerFoot = 4;
    const joistCostPerUnit = 20;
    const railingCostPerPost = 50;
    const totalCost = materialList.boards * 12 * boardCostPerFoot + materialList.joists * joistCostPerUnit + materialList.railings * railingCostPerPost;

    const materialListEl = document.getElementById('material-list');
    const costEstimateEl = document.getElementById('cost-estimate');
    const designSummaryEl = document.getElementById('design-summary');

    if (materialListEl) {
        materialListEl.innerText = `Materials: ${materialList.boards} boards, ${materialList.joists} joists, ${materialList.railings} railing posts`;
    }
    if (costEstimateEl) {
        costEstimateEl.innerText = `Estimated Cost: $${totalCost.toFixed(2)}`;
    }
    if (designSummaryEl) {
        designSummaryEl.innerText = `
Shape: ${deck.shape.charAt(0).toUpperCase() + deck.shape.slice(1)}
Width: ${Math.floor(deck.width)} ft ${Math.round((deck.width % 1) * 12)} in
Length: ${Math.floor(deck.length)} ft ${Math.round((deck.length % 1) * 12)} in
${deck.shape !== 'rectangular' ? `Wing Width: ${Math.floor(deck.wingWidth)} ft ${Math.round((deck.wingWidth % 1) * 12)} in\nWing Length: ${Math.floor(deck.wingLength)} ft ${Math.round((deck.wingLength % 1) * 12)} in` : ''}
${deck.shape === 'multi-level' ? `Second Level Width: ${Math.floor(deck.secondWidth)} ft ${Math.round((deck.secondWidth % 1) * 12)} in\nSecond Level Length: ${Math.floor(deck.secondLength)} ft ${Math.round((deck.secondLength % 1) * 12)} in` : ''}
Height: ${deck.height} ft
Board Length: ${deck.boardLength === 'auto' ? 'Auto-Optimize' : deck.boardLength / 12 + ' ft'}
Board Direction: ${deck.boardDirection}
Board Pattern: ${deck.boardPattern}
Picture Frame: ${deck.pictureFrame ? 'Yes' : 'No'}
Railings: ${deck.railings ? 'Yes' : 'No'}
Color: ${document.getElementById('boardColor').options[document.getElementById('boardColor').selectedIndex].text}
        `;
    }
}

// UI Functions
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    const tab = document.getElementById(tabId);
    const btn = document.querySelector(`button[onclick="openTab('${tabId}')"]`);
    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');
    updateShapeInputs();
}

function updateShapeInputs() {
    const shape = document.getElementById('deckShape').value;
    const wingInputs = document.getElementById('wing-inputs');
    const multiLevelInputs = document.getElementById('multi-level-inputs');
    if (wingInputs) wingInputs.style.display = shape === 'rectangular' ? 'none' : 'block';
    if (multiLevelInputs) multiLevelInputs.style.display = shape === 'multi-level' ? 'block' : 'none';
}

function updateMaterials() {
    deck.color = document.getElementById('boardColor').value;
    buildDeckInternal();
}

function updateLighting() {
    const mode = document.getElementById('lightingMode').value;
    ambientLight.intensity = mode === 'day' ? 0.6 : 0.2;
    directionalLight.intensity = mode === 'day' ? 0.8 : 0.1;
    hemiLight.intensity = mode === 'day' ? 0.3 : 0.1;
}

function setCameraView() {
    const view = document.getElementById('cameraView').value;
    if (view === 'top') {
        camera.position.set(0, 30, 0);
        controls.target.set(0, deck.height, 0);
    } else if (view === 'side') {
        camera.position.set(25, deck.height + 5, 0);
        controls.target.set(0, deck.height, 0);
    } else {
        camera.position.set(15, 10, 15);
        controls.target.set(0, deck.height, 0);
    }
    controls.update();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        deck = JSON.parse(history[historyIndex]);
        updateUI();
        buildDeckInternal();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        deck = JSON.parse(history[historyIndex]);
        updateUI();
        buildDeckInternal();
    }
}

function updateUI() {
    const shapeEl = document.getElementById('deckShape');
    const widthFeetEl = document.getElementById('widthFeet');
    const widthInchesEl = document.getElementById('widthInches');
    const lengthFeetEl = document.getElementById('lengthFeet');
    const lengthInchesEl = document.getElementById('lengthInches');
    const wingWidthFeetEl = document.getElementById('wingWidthFeet');
    const wingWidthInchesEl = document.getElementById('wingWidthInches');
    const wingLengthFeetEl = document.getElementById('wingLengthFeet');
    const wingLengthInchesEl = document.getElementById('wingLengthInches');
    const secondWidthFeetEl = document.getElementById('secondWidthFeet');
    const secondWidthInchesEl = document.getElementById('secondWidthInches');
    const secondLengthFeetEl = document.getElementById('secondLengthFeet');
    const secondLengthInchesEl = document.getElementById('secondLengthInches');
    const deckHeightEl = document.getElementById('deckHeight');
    const boardLengthEl = document.getElementById('boardLength');
    const boardDirectionEl = document.getElementById('boardDirection');
    const boardPatternEl = document.getElementById('boardPattern');
    const pictureFrameEl = document.getElementById('pictureFrame');
    const railingsEl = document.getElementById('railings');
    const boardColorEl = document.getElementById('boardColor');

    if (shapeEl) shapeEl.value = deck.shape;
    if (widthFeetEl) widthFeetEl.value = Math.floor(deck.width);
    if (widthInchesEl) widthInchesEl.value = Math.round((deck.width % 1) * 12);
    if (lengthFeetEl) lengthFeetEl.value = Math.floor(deck.length);
    if (lengthInchesEl) lengthInchesEl.value = Math.round((deck.length % 1) * 12);
    if (wingWidthFeetEl) wingWidthFeetEl.value = Math.floor(deck.wingWidth);
    if (wingWidthInchesEl) wingWidthInchesEl.value = Math.round((deck.wingWidth % 1) * 12);
    if (wingLengthFeetEl) wingLengthFeetEl.value = Math.floor(deck.wingLength);
    if (wingLengthInchesEl) wingLengthInchesEl.value = Math.round((deck.wingLength % 1) * 12);
    if (secondWidthFeetEl) secondWidthFeetEl.value = Math.floor(deck.secondWidth);
    if (secondWidthInchesEl) secondWidthInchesEl.value = Math.round((deck.secondWidth % 1) * 12);
    if (secondLengthFeetEl) secondLengthFeetEl.value = Math.floor(deck.secondLength);
    if (secondLengthInchesEl) secondLengthInchesEl.value = Math.round((deck.secondLength % 1) * 12);
    if (deckHeightEl) deckHeightEl.value = deck.height;
    if (boardLengthEl) boardLengthEl.value = deck.boardLength;
    if (boardDirectionEl) boardDirectionEl.value = deck.boardDirection;
    if (boardPatternEl) boardPatternEl.value = deck.boardPattern;
    if (pictureFrameEl) pictureFrameEl.checked = deck.pictureFrame;
    if (railingsEl) railingsEl.checked = deck.railings;
    if (boardColorEl) boardColorEl.value = deck.color;
    updateShapeInputs();
}

function buildDeck() {
    deck.shape = document.getElementById('deckShape').value;
    deck.width = parseFloat(document.getElementById('widthFeet').value || 0) + parseFloat(document.getElementById('widthInches').value || 0) / 12;
    deck.length = parseFloat(document.getElementById('lengthFeet').value || 0) + parseFloat(document.getElementById('lengthInches').value || 0) / 12;
    deck.wingWidth = parseFloat(document.getElementById('wingWidthFeet').value || 0) + parseFloat(document.getElementById('wingWidthInches').value || 0) / 12;
    deck.wingLength = parseFloat(document.getElementById('wingLengthFeet').value || 0) + parseFloat(document.getElementById('wingLengthInches').value || 0) / 12;
    deck.secondWidth = parseFloat(document.getElementById('secondWidthFeet').value || 0) + parseFloat(document.getElementById('secondWidthInches').value || 0) / 12;
    deck.secondLength = parseFloat(document.getElementById('secondLengthFeet').value || 0) + parseFloat(document.getElementById('secondLengthInches').value || 0) / 12;
    deck.height = parseFloat(document.getElementById('deckHeight').value || 0);
    deck.boardLength = document.getElementById('boardLength').value;
    deck.boardDirection = document.getElementById('boardDirection').value;
    deck.boardPattern = document.getElementById('boardPattern').value;
    deck.pictureFrame = document.getElementById('pictureFrame').checked;
    deck.railings = document.getElementById('railings').checked;
    deck.color = document.getElementById('boardColor').value;

    buildDeckInternal();
}

// Prompt System
const prompts = [
    {
        question: 'Deck Shape?',
        options: ['Rectangular', 'L-Shaped', 'T-Shaped', 'Multi-Level'],
        callback: (value) => deck.shape = value.toLowerCase()
    },
    {
        question: 'Planning on picture framing?',
        options: ['Yes', 'No'],
        callback: (value) => deck.pictureFrame = value === 'Yes'
    },
    {
        question: 'Add railings?',
        options: ['Yes', 'No'],
        callback: (value) => deck.railings = value === 'Yes'
    },
    {
        question: 'Board length preference?',
        options: ['Auto-Optimize', '12 ft', '16 ft', '20 ft'],
        callback: (value) => deck.boardLength = value === 'Auto-Optimize' ? 'auto' : parseFloat(value) * 12
    }
];

let currentPrompt = 0;

function showPrompt() {
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
        buildDeckInternal();
        showTutorial();
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
        if (!answer) {
            console.warn('No answer selected');
            return;
        }

        if (currentPrompt < prompts.length) {
            prompts[currentPrompt].callback(answer);
            currentPrompt++;
            showPrompt();
        }
    } catch (error) {
        console.error('Error in nextPrompt:', error);
    }
}

function skipPrompt() {
    try {
        const promptEl = document.getElementById('prompt');
        if (promptEl) {
            promptEl.style.display = 'none';
        }
        updateUI();
        buildDeckInternal();
        showTutorial();
        updateLoading(1);
    } catch (error) {
        console.error('Error in skipPrompt:', error);
        updateLoading(1);
    }
}

// Tutorial and Help
function showTutorial() {
    const tutorialEl = document.getElementById('tutorial');
    if (tutorialEl) {
        tutorialEl.style.display = 'block';
    }
}

function closeTutorial() {
    const tutorialEl = document.getElementById('tutorial');
    if (tutorialEl) {
        tutorialEl.style.display = 'none';
    }
}

function showHelp() {
    const helpEl = document.getElementById('help');
    if (helpEl) {
        helpEl.style.display = 'block';
    }
}

function closeHelp() {
    const helpEl = document.getElementById('help');
    if (helpEl) {
        helpEl.style.display = 'none';
    }
}

// Orientation Prompt
window.addEventListener('orientationchange', () => {
    if (window.innerWidth < 768 && window.orientation === 0) {
        const orientationPrompt = document.getElementById('orientation-prompt');
        if (orientationPrompt) {
            orientationPrompt.style.display = 'flex';
        }
    } else {
        const orientationPrompt = document.getElementById('orientation-prompt');
        if (orientationPrompt) {
            orientationPrompt.style.display = 'none';
        }
    }
});

// Export Design
function exportDesign() {
    const designData = {
        deck,
        materialList,
        costEstimate: document.getElementById('cost-estimate').innerText
    };

    // JSON Export
    const jsonData = JSON.stringify(designData, null, 2);
    const jsonBlob = new Blob([jsonData], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = 'deck_design.json';
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    // PDF Blueprint
    const latexContent = `
\\documentclass{article}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}
\\usepackage{graphicx}
\\usepackage{xcolor}

\\begin{document}

\\section*{American Pro Decking Blueprint}

\\textbf{Shape:} ${deck.shape.charAt(0).toUpperCase() + deck.shape.slice(1)}\\\\
\\textbf{Dimensions:}
\\begin{itemize}
    \\item Width: ${Math.floor(deck.width)} ft ${Math.round((deck.width % 1) * 12)} in
    \\item Length: ${Math.floor(deck.length)} ft ${Math.round((deck.length % 1) * 12)} in
    ${deck.shape !== 'rectangular' ? `\\item Wing Width: ${Math.floor(deck.wingWidth)} ft ${Math.round((deck.wingWidth % 1) * 12)} in\\item Wing Length: ${Math.floor(deck.wingLength)} ft ${Math.round((deck.wingLength % 1) * 12)} in` : ''}
    ${deck.shape === 'multi-level' ? `\\item Second Level Width: ${Math.floor(deck.secondWidth)} ft ${Math.round((deck.secondWidth % 1) * 12)} in\\item Second Level Length: ${Math.floor(deck.secondLength)} ft ${Math.round((deck.secondLength % 1) * 12)} in` : ''}
    \\item Height: ${deck.height} ft
\\end{itemize}

\\textbf{Features:}
\\begin{itemize}
    \\item Picture Frame: ${deck.pictureFrame ? 'Yes' : 'No'}
    \\item Railings: ${deck.railings ? 'Yes' : 'No'}
    \\item Board Direction: ${deck.boardDirection}
    \\item Board Pattern: ${deck.boardPattern}
    \\item Board Length: ${deck.boardLength === 'auto' ? 'Auto-Optimize' : deck.boardLength / 12 + ' ft'}
\\end{itemize}

\\textbf{Materials:}
\\begin{itemize}
    \\item Boards: ${materialList.boards}
    \\item Joists: ${materialList.joists}
    \\item Railing Posts: ${materialList.railings}
\\end{itemize}

\\textbf{Estimated Cost:} ${document.getElementById('cost-estimate').innerText}

\\textbf{Notes:}
\\begin{itemize}
    \\item Joists are spaced 16 inches on center.
    \\item Deck boards are 1 inch thick by 5.5 inches wide.
    \\item Check local regulations for permit requirements.
\\end{itemize}

\\end{document}
    `;
    const latexBlob = new Blob([latexContent], { type: 'text/latex' });
    const latexUrl = URL.createObjectURL(latexBlob);
    const latexLink = document.createElement('a');
    latexLink.href = latexUrl;
    latexLink.download = 'deck_blueprint.tex';
    latexLink.click();
    URL.revokeObjectURL(latexUrl);
}

// Initialize
camera.position.set(15, 10, 15);
controls.target.set(0, deck.height, 0);
controls.update();
updateLoading(0.5);

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = (window.innerWidth - 350) / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth - 350, window.innerHeight);
});
