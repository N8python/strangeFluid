importScripts('three.min.js');

let spheres, grid, nextInCell;
let numSpheres, sphereFields, X, Y, OLD_X, OLD_Y;
let gridWidth, gridHeight, maxParticlesPerCell;
let sphereRadius, cellSize, sumOfRadiiSquared, invCellSize;
let gravity, restitution;

self.onmessage = function(e) {
    if (e.data.init) {
        // Initialize variables
        ({
            spheres,
            grid,
            nextInCell,
            numSpheres,
            sphereFields,
            X,
            Y,
            OLD_X,
            OLD_Y,
            gridWidth,
            gridHeight,
            maxParticlesPerCell,
            sphereRadius,
            cellSize,
            sumOfRadiiSquared,
            invCellSize,
            gravity,
            restitution
        } = e.data);
    } else {
        // Run physics loop
        const { deltaTime, mouseX, mouseY, mouseDown, width, height } = e.data;
        runPhysics(deltaTime, mouseX, mouseY, mouseDown, width, height);
        self.postMessage(spheres);
    }
};

function resolveCollision(sphere1, sphere2) {
    const sphere1Accessor = sphere1 * sphereFields;
    const sphere2Accessor = sphere2 * sphereFields;
    const sphere1XIndex = sphere1Accessor + X;
    const sphere1YIndex = sphere1Accessor + Y;
    const sphere2XIndex = sphere2Accessor + X;
    const sphere2YIndex = sphere2Accessor + Y;
    const sphere1X = spheres[sphere1XIndex];
    const sphere1Y = spheres[sphere1YIndex];
    const sphere2X = spheres[sphere2XIndex];
    const sphere2Y = spheres[sphere2YIndex];
    const xDist = sphere2X - sphere1X;
    const yDist = sphere2Y - sphere1Y;
    let distance = (xDist * xDist + yDist * yDist);
    if (distance < sumOfRadiiSquared) {
        distance = Math.sqrt(distance);
        const overlap = 0.5 * (cellSize - distance);
        const normalX = overlap * xDist / distance;
        const normalY = overlap * yDist / distance;
        spheres[sphere1XIndex] = sphere1X - normalX;
        spheres[sphere1YIndex] = sphere1Y - normalY;
        spheres[sphere2XIndex] = sphere2X + normalX;
        spheres[sphere2YIndex] = sphere2Y + normalY;
    } else {
        // Move the spheres towards each other
        distance = Math.sqrt(distance);
        const overlap = 0.5 * (cellSize - distance);
        const normalX = overlap * xDist / distance;
        const normalY = overlap * yDist / distance;
        const invDistance = 1.0 / (100 * (distance + 0.1));
        spheres[sphere1XIndex] = sphere1X - invDistance * normalX;
        spheres[sphere1YIndex] = sphere1Y - invDistance * normalY;
        spheres[sphere2XIndex] = sphere2X + invDistance * normalX;
        spheres[sphere2YIndex] = sphere2Y + invDistance * normalY;
    }
}

function runPhysics(deltaTime, mouseX, mouseY, mouseDown, width, height) {
    const STEPS = 4;
    let stepTime = deltaTime / STEPS;
    const gravMult = 0.5 * gravity * stepTime * stepTime;
    const lerpFactor = Math.pow(0.999, stepTime / 0.002);

    for (let step = 0; step < STEPS; step++) {
        let reverse = step % 2 == 0;

        for (let gy = reverse ? gridHeight - 1 : 0; reverse ? gy >= 0 : gy < gridHeight; reverse ? gy-- : gy++) {
            for (let gx = reverse ? gridWidth - 1 : 0; reverse ? gx >= 0 : gx < gridWidth; reverse ? gx-- : gx++) {
                const baseGridIndex = (gy * gridWidth + gx) * maxParticlesPerCell;
                const particlesInBaseCell = nextInCell[gy * gridWidth + gx];

                // Check collisions within the cell
                for (let idx1 = 0; idx1 < particlesInBaseCell; idx1++) {
                    const sphere1 = grid[baseGridIndex + idx1];

                    // Check collisions with other spheres in the same cell
                    for (let idx2 = idx1 + 1; idx2 < particlesInBaseCell; idx2++) {
                        const sphere2 = grid[baseGridIndex + idx2];
                        resolveCollision(sphere1, sphere2);
                    }

                    // Check collisions with spheres in adjacent cells
                    const startX = Math.max(gx - 1, 0);
                    const endX = Math.min(gx + 1, gridWidth - 1);
                    const startY = Math.max(gy - 1, 0);
                    const endY = Math.min(gy + 1, gridHeight - 1);

                    for (let adjY = startY; adjY <= endY; adjY++) {
                        for (let adjX = startX; adjX <= endX; adjX++) {
                            if (adjX == gx && adjY == gy) {
                                continue; // Skip the base cell as it's already handled
                            }

                            const adjGridIndex = (adjY * gridWidth + adjX) * maxParticlesPerCell;
                            const particlesInAdjCell = nextInCell[adjY * gridWidth + adjX];

                            for (let idxAdj = 0; idxAdj < particlesInAdjCell; idxAdj++) {
                                const sphere2 = grid[adjGridIndex + idxAdj];
                                resolveCollision(sphere1, sphere2);
                            }
                        }
                    }
                }
            }
        }
        grid.fill(0);
        nextInCell.fill(0);

        for (let i = 0; i < numSpheres; i++) {
            const index = i * sphereFields;
            const xIndex = index + X;
            const yIndex = index + Y;
            const oldXIndex = index + OLD_X;
            const oldYIndex = index + OLD_Y;
            const currX = spheres[xIndex];
            const currY = spheres[yIndex];
            const oldX = spheres[oldXIndex];
            const oldY = spheres[oldYIndex];
            const xDiff = currX - oldX;
            const yDiff = currY - oldY;
            let newX = currX + xDiff;
            let newY = currY + yDiff + gravMult;

            if (newX - sphereRadius <= 0) {
                newX = sphereRadius - xDiff * restitution;
            }
            if (newX + sphereRadius >= width) {
                newX = width - sphereRadius + xDiff * restitution;
            }
            if (newY - sphereRadius <= 0) {
                newY = sphereRadius - yDiff * restitution;
            }
            if (newY + sphereRadius >= height) {
                newY = height - sphereRadius + yDiff * restitution;
            }
            // Attract to mouse
            if (mouseDown) {
                let dx = mouseX - spheres[index + X];
                let dy = mouseY - spheres[index + Y];
                let distance = (dx * dx + dy * dy);
                if (distance < 40000) {
                    distance = Math.sqrt(distance);
                    const force = 0.01 * (200 - distance);
                    dx /= distance;
                    dy /= distance;
                    newX += dx * force * deltaTime;
                    newY += dy * force * deltaTime;
                }
            }

            spheres[oldXIndex] = currX;
            spheres[oldYIndex] = currY;
            const finalX = newX * lerpFactor + currX * (1 - lerpFactor);
            const finalY = newY * lerpFactor + currY * (1 - lerpFactor);
            spheres[xIndex] = finalX;
            spheres[yIndex] = finalY;

            // Update grid
            const gridX = (finalX * invCellSize) | 0;
            const gridY = (finalY * invCellSize) | 0;
            const gridXY = gridY * gridWidth + gridX;
            const gridIndex = gridXY * maxParticlesPerCell;
            const nextSlot = nextInCell[gridXY]++;
            if (nextSlot < maxParticlesPerCell) {
                grid[gridIndex + nextSlot] = i;
            }
        }
    }
}
