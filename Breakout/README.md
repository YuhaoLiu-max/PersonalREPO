# Breakout - TC2005B

A classic Breakout game built with JavaScript and HTML5 Canvas.

## How to Run

1. Clone or download the repository
2. Open `breakout.html` in a web browser
3. No installation or server required

## Controls

| Key | Action |
|-----|--------|
| `A` or `←` | Move paddle left |
| `D` or `→` | Move paddle right |
| `Space` | Launch ball |
| `R` | Restart game (after Game Over or Win) |

## Rules

- The ball bounces off the left, right, and top walls
- If the ball falls off the bottom, you lose a life
- Hit a block with the ball to destroy it
- Destroy all blocks to advance to the next level

## Objective

Complete all 3 levels to win the game.

| Level | Rows of Blocks |
|-------|---------------|
| 1 | 3 |
| 2 | 4 |
| 3 | 5 |

The ball speeds up slightly with each level.

## Scoring

The HUD displays:
- **Blocks** — total blocks destroyed
- **Lives** — lives remaining (start with 3)
- **Level** — current level out of 3

## Game States

- **Playing** — move the paddle and destroy all blocks
- **Game Over** — all lives lost; press `R` to restart
- **You Win** — all 3 levels completed; press `R` to play again
