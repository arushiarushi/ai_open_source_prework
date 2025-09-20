// Game client for MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.players = {};
        this.avatars = {};
        this.myPlayerId = null;
        this.myPlayer = null;
        
        // Avatar image cache
        this.avatarImageCache = {};
        
        // Viewport/camera system
        this.cameraX = 0;
        this.cameraY = 0;
        
        // WebSocket connection
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Movement state
        this.pressedKeys = {};
        this.isMoving = false;
        
        // Click-to-move
        this.targetX = null;
        this.targetY = null;
        
        this.init();
    }
    
    init() {
        // Set canvas size to fill the browser window
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Load the world map image
        this.loadWorldMap();
        
        // Connect to game server
        this.connectToServer();
        
        // Start render loop
        this.startRenderLoop();
        
        // Add keyboard event listeners
        this.setupKeyboardControls();
        
        // Add click-to-move
        this.setupClickToMove();
        
        // Initialize HUD
        this.initializeHUD();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateCamera();
    }
    
    startRenderLoop() {
        const render = () => {
            this.render();
            requestAnimationFrame(render);
        };
        render();
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
    }
    
    handleKeyDown(event) {
        // Prevent default behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
        }
        
        // Only handle arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            return;
        }
        
        // If key is already pressed, don't send another command
        if (this.pressedKeys[event.code]) {
            return;
        }
        
        // Mark key as pressed
        this.pressedKeys[event.code] = true;
        
        // Send movement command
        this.sendMovementCommand(event.code);
    }
    
    handleKeyUp(event) {
        // Only handle arrow keys
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            return;
        }
        
        // Mark key as not pressed
        this.pressedKeys[event.code] = false;
        
        // Check if any movement keys are still pressed
        const hasMovementKeys = Object.keys(this.pressedKeys).some(key => this.pressedKeys[key]);
        
        if (!hasMovementKeys && this.isMoving) {
            // No movement keys pressed, send stop command
            this.sendStopCommand();
        }
    }
    
    sendMovementCommand(keyCode) {
        const directionMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        const direction = directionMap[keyCode];
        if (direction) {
            this.sendMessage({
                action: 'move',
                direction: direction
            });
            this.isMoving = true;
        }
    }
    
    sendStopCommand() {
        this.sendMessage({
            action: 'stop'
        });
        this.isMoving = false;
    }
    
    setupClickToMove() {
        this.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
    }
    
    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        const worldPos = this.screenToWorld(clickX, clickY);
        
        // Set target position
        this.targetX = worldPos.x;
        this.targetY = worldPos.y;
        
        // Send click-to-move command
        this.sendMessage({
            action: 'move',
            x: Math.round(worldPos.x),
            y: Math.round(worldPos.y)
        });
        
        this.isMoving = true;
    }
    
    initializeHUD() {
        this.updateHUD();
    }
    
    updateHUD() {
        // Update player name
        const playerNameEl = document.getElementById('playerName');
        if (playerNameEl && this.myPlayer) {
            playerNameEl.textContent = this.myPlayer.username;
        }
        
        // Update player position
        const playerPositionEl = document.getElementById('playerPosition');
        if (playerPositionEl && this.myPlayer) {
            playerPositionEl.textContent = `Position: (${Math.round(this.myPlayer.x)}, ${Math.round(this.myPlayer.y)})`;
        }
        
        // Update connection status
        const connectionStatusEl = document.getElementById('connectionStatus');
        if (connectionStatusEl) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                connectionStatusEl.textContent = 'Connected';
                connectionStatusEl.className = 'connected';
            } else {
                connectionStatusEl.textContent = 'Disconnected';
                connectionStatusEl.className = 'disconnected';
            }
        }
        
        // Update player count
        const playerCountEl = document.getElementById('playerCount');
        if (playerCountEl) {
            const playerCount = Object.keys(this.players).length;
            playerCountEl.textContent = `Players: ${playerCount}`;
        }
    }
    
    loadWorldMap() {
        const img = new Image();
        img.onload = () => {
            this.worldImage = img;
            this.render();
        };
        img.onerror = () => {
            console.error('Failed to load world map image');
        };
        img.src = 'world.jpg';
    }
    
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.reconnectAttempts = 0;
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.attemptReconnect();
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connectToServer(), 2000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Arushi'
        };
        
        this.sendMessage(joinMessage);
    }
    
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket not connected');
        }
    }
    
    handleServerMessage(data) {
        console.log('Server message:', data);
        
        switch (data.action) {
            case 'join_game':
                if (data.success) {
                    this.myPlayerId = data.playerId;
                    this.players = data.players;
                    this.avatars = data.avatars;
                    this.myPlayer = this.players[this.myPlayerId];
                    this.updateCamera();
                    this.updateHUD();
                    console.log('Successfully joined game as:', this.myPlayer);
                } else {
                    console.error('Failed to join game:', data.error);
                }
                break;
                
            case 'player_joined':
                this.players[data.player.id] = data.player;
                this.avatars[data.avatar.name] = data.avatar;
                this.updateHUD();
                break;
                
            case 'players_moved':
                Object.assign(this.players, data.players);
                // Update camera if my player moved
                if (this.myPlayer && data.players[this.myPlayerId]) {
                    this.myPlayer = data.players[this.myPlayerId];
                    this.updateCamera();
                    this.updateHUD();
                }
                break;
                
            case 'player_left':
                delete this.players[data.playerId];
                this.updateHUD();
                break;
                
            default:
                console.log('Unknown message type:', data.action);
        }
    }
    
    updateCamera() {
        if (this.myPlayer) {
            // Center the camera on the player
            this.cameraX = this.myPlayer.x - this.canvas.width / 2;
            this.cameraY = this.myPlayer.y - this.canvas.height / 2;
            
            // Clamp camera to world bounds
            this.cameraX = Math.max(0, Math.min(this.cameraX, this.worldWidth - this.canvas.width));
            this.cameraY = Math.max(0, Math.min(this.cameraY, this.worldHeight - this.canvas.height));
        }
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.cameraX,
            y: worldY - this.cameraY
        };
    }
    
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.cameraX,
            y: screenY + this.cameraY
        };
    }
    
    isPlayerVisible(player) {
        const screenPos = this.worldToScreen(player.x, player.y);
        return screenPos.x > -100 && screenPos.x < this.canvas.width + 100 &&
               screenPos.y > -100 && screenPos.y < this.canvas.height + 100;
    }
    
    getAvatarImage(avatarName, facing, frameIndex) {
        const cacheKey = `${avatarName}_${facing}_${frameIndex}`;
        
        if (this.avatarImageCache[cacheKey]) {
            return this.avatarImageCache[cacheKey];
        }
        
        if (!this.avatars[avatarName]) return null;
        
        const avatarData = this.avatars[avatarName];
        let frames = avatarData.frames[facing];
        
        if (!frames && facing === 'west') {
            // West direction uses flipped east frames
            frames = avatarData.frames.east;
        }
        
        if (!frames || frames.length === 0) return null;
        
        const actualFrameIndex = Math.min(frameIndex, frames.length - 1);
        const frameData = frames[actualFrameIndex];
        
        // Create and cache the image
        const img = new Image();
        img.onload = () => {
            this.avatarImageCache[cacheKey] = img;
        };
        img.src = frameData;
        
        return null; // Return null initially, will be available next frame
    }
    
    renderAvatar(player) {
        if (!this.avatars[player.avatar]) return;
        
        const screenPos = this.worldToScreen(player.x, player.y);
        const frameIndex = Math.min(player.animationFrame || 0, 2);
        
        // Get cached avatar image
        const img = this.getAvatarImage(player.avatar, player.facing, frameIndex);
        if (!img) return; // Image not loaded yet
        
        // Calculate avatar size (maintain aspect ratio)
        const maxSize = 64;
        const aspectRatio = img.width / img.height;
        let avatarWidth = maxSize;
        let avatarHeight = maxSize;
        
        if (aspectRatio > 1) {
            avatarHeight = maxSize / aspectRatio;
        } else {
            avatarWidth = maxSize * aspectRatio;
        }
        
        // Draw avatar centered on player position
        const drawX = screenPos.x - avatarWidth / 2;
        const drawY = screenPos.y - avatarHeight / 2;
        
        // Flip horizontally for west direction
        if (player.facing === 'west') {
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(img, -drawX - avatarWidth, drawY, avatarWidth, avatarHeight);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(img, drawX, drawY, avatarWidth, avatarHeight);
        }
        
        // Draw username label
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        
        const labelY = drawY - 10;
        this.ctx.strokeText(player.username, screenPos.x, labelY);
        this.ctx.fillText(player.username, screenPos.x, labelY);
    }
    
    renderTargetIndicator() {
        if (this.targetX !== null && this.targetY !== null) {
            const screenPos = this.worldToScreen(this.targetX, this.targetY);
            
            // Only draw if target is visible
            if (screenPos.x > -50 && screenPos.x < this.canvas.width + 50 &&
                screenPos.y > -50 && screenPos.y < this.canvas.height + 50) {
                
                // Draw target circle
                this.ctx.save();
                this.ctx.strokeStyle = '#FF6B6B';
                this.ctx.fillStyle = 'rgba(255, 107, 107, 0.3)';
                this.ctx.lineWidth = 3;
                
                // Outer circle
                this.ctx.beginPath();
                this.ctx.arc(screenPos.x, screenPos.y, 20, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                
                // Inner cross
                this.ctx.strokeStyle = '#FF6B6B';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.moveTo(screenPos.x - 10, screenPos.y);
                this.ctx.lineTo(screenPos.x + 10, screenPos.y);
                this.ctx.moveTo(screenPos.x, screenPos.y - 10);
                this.ctx.lineTo(screenPos.x, screenPos.y + 10);
                this.ctx.stroke();
                
                this.ctx.restore();
            }
        }
    }
    
    render() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the world map with camera offset
        this.ctx.drawImage(
            this.worldImage,
            this.cameraX, this.cameraY, // source position (camera offset)
            this.canvas.width, this.canvas.height, // source size (viewport)
            0, 0, // destination position (upper left of canvas)
            this.canvas.width, this.canvas.height // destination size (fill canvas)
        );
        
        // Draw all visible players
        Object.values(this.players).forEach(player => {
            if (this.isPlayerVisible(player)) {
                this.renderAvatar(player);
            }
        });
        
        // Draw target indicator for click-to-move
        this.renderTargetIndicator();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
