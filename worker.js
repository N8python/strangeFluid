let spheres, numSpheres, sphereFields, cellSize, sumOfRadiiSquared, invCellSize, maxParticlesPerCell, gridWidth, gridHeight, width, height;
let grid, cellStartEnd;

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        init(e.data);
    } else if (e.data.type === 'update') {
        update(e.data.deltaTime, e.data.mouseData, e.data.steps);
    }
};

function init(data) {
    numSpheres = data.numSpheres;
    sphereFields = data.sphereFields;
    cellSize = data.cellSize;
    sumOfRadiiSquared = data.sumOfRadiiSquared;
    invCellSize = data.invCellSize;
    maxParticlesPerCell = data.maxParticlesPerCell;
    gridWidth = data.gridWidth;
    gridHeight = data.gridHeight;
    width = data.width;
    height = data.height;

    spheres = new Float32Array(numSpheres * sphereFields);
    grid = new Int32Array(gridWidth * gridHeight * maxParticlesPerCell);
    cellStartEnd = new Int32Array(gridWidth * gridHeight * 2);

    for (let i = 0; i < numSpheres; i++) {
        const index = i * sphereFields;
        spheres[index + 0] = 4 * cellSize + (4 * cellSize * i) % (width - 8 * cellSize) + cellSize * (Math.random() - 0.5);
        spheres[index + 1] = 100 + Math.floor((4 * cellSize * i) / (width - 8 * cellSize)) * 2 * cellSize + cellSize * (Math.random() - 0.5);
        spheres[index + 2] = spheres[index + 0];
        spheres[index + 3] = spheres[index + 1];
    }
}

function update(deltaTime, mouseData, steps) {
    const stepDeltaTime = deltaTime / steps;
    const { mouseX, mouseY, mouseDown } = mouseData;

    for (let step = 0; step < steps; step++) {
        // Clear grid
        grid.fill(-1);
        cellStartEnd.fill(0);

        // Populate grid
        for (let i = 0; i < numSpheres; i++) {
            const cellX = Math.floor(spheres[i * sphereFields + 0] * invCellSize);
            const cellY = Math.floor(spheres[i * sphereFields + 1] * invCellSize);
            const cellIndex = cellY * gridWidth + cellX;
            const startEndIndex = cellIndex * 2;

            if (cellStartEnd[startEndIndex] === 0) {
                cellStartEnd[startEndIndex] = i;
                cellStartEnd[startEndIndex + 1] = i + 1;
            } else {
                cellStartEnd[startEndIndex + 1]++;
            }

            const gridIndex = cellIndex * maxParticlesPerCell + (cellStartEnd[startEndIndex + 1] - cellStartEnd[startEndIndex]) - 1;
            if (gridIndex < grid.length) {
                grid[gridIndex] = i;
            }
        }

        // Update positions
        for (let i = 0; i < numSpheres; i++) {
            const index = i * sphereFields;
            const oldX = spheres[index + 2];
            const oldY = spheres[index + 3];

            let newX = 2 * spheres[index + 0] - oldX;
            let newY = 2 * spheres[index + 1] - oldY + 1000 * stepDeltaTime * stepDeltaTime;

            if (mouseDown) {
                const dx = mouseX - newX;
                const dy = mouseY - newY;
                const distSquared = dx * dx + dy * dy;
                if (distSquared < 200 * 200) {
                    const dist = Math.sqrt(distSquared);
                    const force = 5000 / (dist + 1);
                    newX -= force * dx / dist * stepDeltaTime * stepDeltaTime;
                    newY -= force * dy / dist * stepDeltaTime * stepDeltaTime;
                }
            }

            spheres[index + 2] = spheres[index + 0];
            spheres[index + 3] = spheres[index + 1];
            spheres[index + 0] = newX;
            spheres[index + 1] = newY;
        }

        // Resolve collisions
        for (let cellY = 0; cellY < gridHeight; cellY++) {
            for (let cellX = 0; cellX < gridWidth; cellX++) {
                const cellIndex = cellY * gridWidth + cellX;
                const startEndIndex = cellIndex * 2;
                const start = cellStartEnd[startEndIndex];
                const end = cellStartEnd[startEndIndex + 1];

                for (let i = start; i < end; i++) {
                    const indexI = grid[cellIndex * maxParticlesPerCell + i - start];
                    if (indexI === -1) continue;

                    for (let j = i + 1; j < end; j++) {
                        const indexJ = grid[cellIndex * maxParticlesPerCell + j - start];
                        if (indexJ === -1) continue;

                        resolveCollision(indexI, indexJ);
                    }

                    for (let offsetY = -1; offsetY <= 1; offsetY++) {
                        for (let offsetX = -1; offsetX <= 1; offsetX++) {
                            if (offsetX === 0 && offsetY === 0) continue;

                            const neighborX = cellX + offsetX;
                            const neighborY = cellY + offsetY;

                            if (neighborX < 0 || neighborX >= gridWidth || neighborY < 0 || neighborY >= gridHeight) continue;

                            const neighborCellIndex = neighborY * gridWidth + neighborX;
                            const neighborStartEndIndex = neighborCellIndex * 2;
                            const neighborStart = cellStartEnd[neighborStartEndIndex];
                            const neighborEnd = cellStartEnd[neighborStartEndIndex + 1];

                            for (let j = neighborStart; j < neighborEnd; j++) {
                                const indexJ = grid[neighborCellIndex * maxParticlesPerCell + j - neighborStart];
                                if (indexJ === -1) continue;

                                resolveCollision(indexI, indexJ);
                            }
                        }
                    }
                }
            }
        }

        // Constrain to bounds
        for (let i = 0; i < numSpheres; i++) {
            const index = i * sphereFields;
            if (spheres[index + 0] < cellSize) {
                spheres[index + 0] = cellSize;
                spheres[index + 2] = spheres[index + 0] + (spheres[index + 0] - spheres[index + 2]);
            } else if (spheres[index + 0] > width - cellSize) {
                spheres[index + 0] = width - cellSize;
                spheres[index + 2] = spheres[index + 0] + (spheres[index + 0] - spheres[index + 2]);
            }
            if (spheres[index + 1] < cellSize) {
                spheres[index + 1] = cellSize;
                spheres[index + 3] = spheres[index + 1] + (spheres[index + 1] - spheres[index + 3]);
            } else if (spheres[index + 1] > height - cellSize) {
                spheres[index + 1] = height - cellSize;
                spheres[index + 3] = spheres[index + 1] + (spheres[index + 1] - spheres[index + 3]);
            }
        }
    }

    self.postMessage({
        type: 'updatePositions',
        spheres: spheres
    });
}

function resolveCollision(i, j) {
    const indexI = i * sphereFields;
    const indexJ = j * sphereFields;

    const dx = spheres[indexJ + 0] - spheres[indexI + 0];
    const dy = spheres[indexJ + 1] - spheres[indexI + 1];
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared < sumOfRadiiSquared && distanceSquared > 0) {
        const distance = Math.sqrt(distanceSquared);
        const overlap = cellSize - distance;
        const percent = overlap / distance / 2;
        const offsetX = dx * percent;
        const offsetY = dy * percent;

        spheres[indexI + 0] -= offsetX;
        spheres[indexI + 1] -= offsetY;
        spheres[indexJ + 0] += offsetX;
        spheres[indexJ + 1] += offsetY;

        // Update old positions to maintain velocity
        spheres[indexI + 2] -= offsetX;
        spheres[indexI + 3] -= offsetY;
        spheres[indexJ + 2] += offsetX;
        spheres[indexJ + 3] += offsetY;
    }
}
