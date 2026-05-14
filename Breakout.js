/*
 * Breakout Game
 *
 * Gilberto Echeverria/Yuhao Liu
 * 2025-05-13
 */
"use strict";

// canvas size
const canvasWidth = 800;
const canvasHeight = 600;

let ctx;
let game;
let oldTime = 0;

// speeds, can tweak these
let paddleSpeed = 0.5;
let ballSpeed = 0.4;

// block grid setup
const COLS = 8;
const BW = 80;   // block width
const BH = 22;   // block height
const GAP = 8;
const startX = (canvasWidth - COLS * (BW + GAP) - GAP) / 2;
const startY = 60;

// one color per row
const COLORS = ["#e63950", "#f07830", "#f5c518", "#3bba5e", "#3d8ef5"];

// check if two objects overlap using their position + halfSize
function overlap(a, b) {
    let dx = Math.abs(a.position.x - b.position.x);
    let dy = Math.abs(a.position.y - b.position.y);
    return dx < a.halfSize.x + b.halfSize.x && dy < a.halfSize.y + b.halfSize.y;
}

// Ball class
class Ball extends GameObject {
    constructor(pos, size, color) {
        super(pos, size, size, color);
        this.velocity = new Vector(0, 0);
        this.launched = false;
    }

    update(dt) {
        if (!this.launched) return;
        this.velocity = this.velocity.normalize().times(ballSpeed);
        this.position = this.position.plus(this.velocity.times(dt));
        this.wallBounce();
    }

    launch() {
        // pick a random angle going upward
        let angle = Math.PI / 4 + Math.random() * (Math.PI / 6);
        this.velocity.x = Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1);
        this.velocity.y = -Math.sin(angle);
        this.launched = true;
    }

    reset(x, y) {
        this.position = new Vector(x, y);
        this.velocity = new Vector(0, 0);
        this.launched = false;
    }

    wallBounce() {
        // left wall
        if (this.position.x - this.halfSize.x < 0) {
            this.position.x = this.halfSize.x;
            this.velocity.x = Math.abs(this.velocity.x);
        }
        // right wall
        if (this.position.x + this.halfSize.x > canvasWidth) {
            this.position.x = canvasWidth - this.halfSize.x;
            this.velocity.x = -Math.abs(this.velocity.x);
        }
        // top wall
        if (this.position.y - this.halfSize.y < 0) {
            this.position.y = this.halfSize.y;
            this.velocity.y = Math.abs(this.velocity.y);
        }
    }
}

// Paddle class
class Player extends GameObject {
    constructor(pos, w, h, color) {
        super(pos, w, h, color);
        this.velocity = new Vector(0, 0);
        this.keys = [];
        this.motion = {
            left:  { axis: "x", sign: -1 },
            right: { axis: "x", sign: 1 }
        };
    }

    update(dt) {
        this.velocity.x = 0;
        this.velocity.y = 0;

        for (let dir of this.keys) {
            let m = this.motion[dir];
            this.velocity[m.axis] += m.sign;
        }

        this.velocity = this.velocity.normalize().times(paddleSpeed);
        this.position = this.position.plus(this.velocity.times(dt));
        this.keepInBounds();
    }

    keepInBounds() {
        if (this.position.x - this.halfSize.x < 0)
            this.position.x = this.halfSize.x;
        if (this.position.x + this.halfSize.x > canvasWidth)
            this.position.x = canvasWidth - this.halfSize.x;
    }
}

class Game {
    constructor() {
        this.level = 1;
        this.lives = 3;
        this.blocksDestroyed = 0;
        this.over = false;
        this.win = false;

        this.setup();
        this.createEventListeners();
    }

    setup() {
        let numRows = 2 + this.level;

        this.bg = new GameObject(
            new Vector(canvasWidth / 2, canvasHeight / 2),
            canvasWidth, canvasHeight, "#1a1a2e"
        );

        this.paddle = new Player(
            new Vector(canvasWidth / 2, canvasHeight - 40),
            110, 13, "#ddd"
        );

        this.ball = new Ball(
            new Vector(canvasWidth / 2, canvasHeight - 60),
            11, "#fff"
        );

        // build the block grid
        this.blocks = [];
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < COLS; c++) {
                let x = startX + c * (BW + GAP) + BW / 2;
                let y = startY + r * (BH + GAP) + BH / 2;
                let block = new GameObject(new Vector(x, y), BW, BH, COLORS[r % COLORS.length]);
                block.alive = true;
                this.blocks.push(block);
            }
        }
    }

    countBlocks() {
        let count = 0;
        for (let b of this.blocks) {
            if (b.alive) count++;
        }
        return count;
    }

    update(dt) {
        if (this.over || this.win) return;

        this.paddle.update(dt);
        this.ball.update(dt);

        // keep ball attached to paddle until launched
        if (!this.ball.launched) {
            this.ball.position.x = this.paddle.position.x;
            this.ball.position.y = this.paddle.position.y - this.paddle.halfSize.y - this.ball.halfSize.y - 2;
        }

        // paddle hit
        if (this.ball.launched && overlap(this.ball, this.paddle)) {
            this.ball.velocity.y = -Math.abs(this.ball.velocity.y);
            // angle the ball depending on where it hit the paddle
            let offset = (this.ball.position.x - this.paddle.position.x) / this.paddle.halfSize.x;
            this.ball.velocity.x += offset * 0.4;
            // push ball out so it doesnt get stuck
            this.ball.position.y = this.paddle.position.y - this.paddle.halfSize.y - this.ball.halfSize.y - 1;
        }

        // block hits
        for (let b of this.blocks) {
            if (!b.alive) continue;
            if (!this.ball.launched) continue;

            if (overlap(this.ball, b)) {
                b.alive = false;
                this.blocksDestroyed++;

                // figure out which axis to bounce on
                let ox = this.ball.halfSize.x + b.halfSize.x - Math.abs(this.ball.position.x - b.position.x);
                let oy = this.ball.halfSize.y + b.halfSize.y - Math.abs(this.ball.position.y - b.position.y);
                if (ox < oy) {
                    this.ball.velocity.x *= -1;
                } else {
                    this.ball.velocity.y *= -1;
                }
                break;
            }
        }

        // ball dropped
        if (this.ball.position.y - this.ball.halfSize.y > canvasHeight) {
            this.lives--;
            if (this.lives <= 0) {
                this.over = true;
            } else {
                this.ball.reset(this.paddle.position.x, this.paddle.position.y - 30);
            }
        }

        // level cleared
        if (this.countBlocks() === 0) {
            if (this.level >= 3) {
                this.win = true;
            } else {
                this.level++;
                ballSpeed += 0.05;
                this.setup();
            }
        }
    }

    draw(ctx) {
        this.bg.draw(ctx);

        for (let b of this.blocks) {
            if (b.alive) b.draw(ctx);
        }

        this.paddle.draw(ctx);
        this.ball.draw(ctx);

        // HUD
        ctx.font = "15px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "left";
        ctx.fillText("Blocks: " + this.blocksDestroyed, 10, canvasHeight - 12);
        ctx.textAlign = "right";
        ctx.fillText("Lives: " + this.lives, canvasWidth - 10, canvasHeight - 12);
        ctx.textAlign = "center";
        ctx.fillText("Level " + this.level + " / 3", canvasWidth / 2, canvasHeight - 12);
        ctx.textAlign = "left";

        if (!this.ball.launched && !this.over && !this.win) {
            ctx.font = "18px Arial";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText("Press SPACE to launch", canvasWidth / 2, canvasHeight / 2 + 10);
            ctx.textAlign = "left";
        }

        if (this.over) {
            ctx.font = "bold 58px Arial";
            ctx.fillStyle = "#e63950";
            ctx.textAlign = "center";
            ctx.fillText("GAME OVER", canvasWidth / 2, canvasHeight / 2);
            ctx.font = "18px Arial";
            ctx.fillStyle = "white";
            ctx.fillText("Press R to restart", canvasWidth / 2, canvasHeight / 2 + 45);
            ctx.textAlign = "left";
        }

        if (this.win) {
            ctx.font = "bold 58px Arial";
            ctx.fillStyle = "#f5c518";
            ctx.textAlign = "center";
            ctx.fillText("YOU WIN!", canvasWidth / 2, canvasHeight / 2);
            ctx.font = "18px Arial";
            ctx.fillStyle = "white";
            ctx.fillText("Press R to restart", canvasWidth / 2, canvasHeight / 2 + 45);
            ctx.textAlign = "left";
        }
    }

    createEventListeners() {
        window.addEventListener("keydown", (e) => {
            if (e.key === "a" || e.key === "ArrowLeft") this.addKey("left");
            if (e.key === "d" || e.key === "ArrowRight") this.addKey("right");

            if (e.code === "Space" && !this.ball.launched && !this.over && !this.win) {
                this.ball.launch();
            }

            if ((e.key === "r" || e.key === "R") && (this.over || this.win)) {
                this.level = 1;
                this.lives = 3;
                this.blocksDestroyed = 0;
                this.over = false;
                this.win = false;
                ballSpeed = 0.4;
                paddleSpeed = 0.5;
                this.setup();
            }
        });

        window.addEventListener("keyup", (e) => {
            if (e.key === "a" || e.key === "ArrowLeft") this.delKey("left");
            if (e.key === "d" || e.key === "ArrowRight") this.delKey("right");
        });
    }

    addKey(dir) {
        if (!this.paddle.keys.includes(dir)) this.paddle.keys.push(dir);
    }

    delKey(dir) {
        let i = this.paddle.keys.indexOf(dir);
        if (i !== -1) this.paddle.keys.splice(i, 1);
    }
}

function main() {
    const canvas = document.getElementById("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx = canvas.getContext("2d");
    game = new Game();
    drawScene(0);
}

function drawScene(newTime) {
    let dt = newTime - oldTime;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    game.update(dt);
    game.draw(ctx);
    oldTime = newTime;
    requestAnimationFrame(drawScene);
}