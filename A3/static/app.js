// Yuhao Liu - A01787782
const glCanvas = document.getElementById("glcanvas");
const info = document.getElementById("info");

let gl, program, textureProgram;
let nodes = {}, routes = {}, baterias = {};
let celda = 10; // lado de una celda en pixeles
let agents = [];
let running = false;
let lastTime = 0;
const SPEED = 4.0; // pasos de simulacion por segundo

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_translation;
uniform vec2 u_scale;
out vec2 v_uv;
void main() {
  vec2 p = a_position * u_scale + u_translation;
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = a_uv;
}`;

const fragmentShaderSource = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  vec4 c = texture(u_texture, v_uv);
  if (c.a < 0.05 || c.r + c.g + c.b < 0.15) discard; // no dibuja el fondo negro del robot
  outColor = c;
}`;

const colorVertex = `#version 300 es
in vec2 a_position;
uniform vec2 u_translation;
uniform vec2 u_scale;
void main() {
  vec2 p = a_position * u_scale + u_translation;
  gl_Position = vec4(p,0.0,1.0);
}`;
const colorFragment = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main(){ outColor=u_color; }`;

function shader(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function makeProgram(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function createTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function makeQuad() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1,-1, 0,0,  1,-1, 1,0,  -1,1, 0,1,
    -1,1, 0,1,   1,-1, 1,0,   1,1, 1,1
  ]), gl.STATIC_DRAW);

  const pos = gl.getAttribLocation(textureProgram, "a_position");
  const uv = gl.getAttribLocation(textureProgram, "a_uv");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv,2,gl.FLOAT,false,16,8);
  return vao;
}

function resize() {
  const dpr = devicePixelRatio || 1;
  glCanvas.width = innerWidth*dpr;
  glCanvas.height = innerHeight*dpr;
  glCanvas.style.width = innerWidth+"px";
  glCanvas.style.height = innerHeight+"px";
  gl.viewport(0,0,glCanvas.width,glCanvas.height);
}

// pasa un punto del cuarto a la pantalla, dejando libre el cuadro de info
function project(point) {
  const xs = Object.values(nodes).map(n=>n.point[0]);
  const ys = Object.values(nodes).map(n=>n.point[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const reserva = 340; // espacio del cuadro de info
  celda = Math.min(0.9 * (innerWidth - reserva) / (maxX - minX + 1), 0.8 * innerHeight / (maxY - minY + 1));
  return [(point[0] - (minX + maxX) / 2) * 2 * celda / innerWidth + reserva / innerWidth,
    (point[1] - (minY + maxY) / 2) * 2 * celda / innerHeight - 0.1];
}

function makeAgents() {
  agents = Object.entries(routes).map(([id, route]) => ({
    id:Number(id), route, segment:0, t:0, done:route.length<2
  }));
}

// avanza a los agentes, un nodo de la ruta por paso de tiempo
function step(dt) {
  for (const a of agents) {
    if (!a.done) {
      a.t += SPEED * dt;
      while (a.t >= 1 && !a.done) {
        a.t -= 1;
        a.segment++;
        a.done = a.segment >= a.route.length - 1;
      }
    }
  }
  // la simulacion termina cuando todos llegan al final de su ruta
  if (agents.length && agents.every(a=>a.done)) running=false;
}

function agentPosition(a) {
  const node = nodes[a.route[a.segment]];
  if (a.done || a.segment>=a.route.length-1) return node.point;
  const next=nodes[a.route[a.segment+1]];
  return [
    node.point[0]+(next.point[0]-node.point[0])*a.t,
    node.point[1]+(next.point[1]-node.point[1])*a.t,
    node.point[2]+(next.point[2]-node.point[2])*a.t
  ];
}

// pasa un punto del cuarto a un cuadro en pixeles enteros del canvas: [x, y, lado]
function enPixeles(pos, scale) {
  const p = project(pos);
  const lado = Math.max(1, Math.round(scale * celda * (devicePixelRatio || 1)));
  return [Math.round((p[0] + 1) / 2 * glCanvas.width - lado / 2),
    Math.round((p[1] + 1) / 2 * glCanvas.height - lado / 2), lado];
}

// pinta una celda completa de un color (rgb de 0 a 1)
function pintarCelda(pos, color) {
  const [x, y, lado] = enPixeles(pos, 0.9);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(x, y, lado, lado);
  gl.clearColor(color[0], color[1], color[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
}

// dibuja una imagen en una celda, con tamano segun la celda
function drawSprite(tex, pos, scale) {
  gl.useProgram(textureProgram);
  gl.bindVertexArray(quad);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.uniform1i(gl.getUniformLocation(textureProgram,"u_texture"),0);
  const [x, y, lado] = enPixeles(pos, scale);
  const W = glCanvas.width, H = glCanvas.height;
  gl.uniform2f(gl.getUniformLocation(textureProgram,"u_translation"),(x+lado/2)*2/W-1,(y+lado/2)*2/H-1);
  gl.uniform2f(gl.getUniformLocation(textureProgram,"u_scale"),lado/W,lado/H);
  gl.drawArrays(gl.TRIANGLES,0,6);
}

// dibuja el cuarto, los robots y el cuadro con episodio, % limpio y pila
function draw() {
  gl.clearColor(0.07,0.07,0.07,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const paso = agents.length ? agents[0].segment : 0;
  let sucias = 0, libres = 0;
  // la estacion es un cuadro amarillo
  for (const n of Object.values(nodes).filter(n=>n.estacion)) pintarCelda(n.point, [1, 0.83, 0]);
  for (const n of Object.values(nodes)) {
    const sucio = n.dirt && (n.limpia === null || paso < n.limpia);
    sucias += sucio ? 1 : 0;
    libres += n.obstaculo ? 0 : 1;
    drawSprite(sucio ? fullTex : emptyTex, n.point, 0.4); // los obstaculos se ven como celda limpia
  }
  for (const a of agents) {
    drawSprite(robotTex, agentPosition(a), 0.6);
  }

  // las etiquetas van como html encima del canvas
  updateLabels();
  const status = running ? "Running" : "Simulation stopped";
  const states = agents.map(a=>`Agent ${a.id}: ${baterias[a.id][a.segment]}% ${a.done ? "finished" : "moving"}`).join("\n");
  info.textContent = `${status} | Episode ${paso} | Clean ${(100 * (libres - sucias) / libres).toFixed(1)}%\n${states}`;
}

// pone la etiqueta de cada robot con su pila
function updateLabels() {
  document.querySelectorAll(".node-label").forEach(e=>e.remove());
  for (const a of agents) {
    const texto = `A${a.id} ${baterias[a.id][a.segment]}%`;
    const p=project(agentPosition(a));
    const x=(p[0]+1)*0.5*innerWidth;
    const y=(1-(p[1]+1)*0.5)*innerHeight;
    const d=document.createElement("div");
    d.className="node-label";
    d.textContent=texto;
    const lugar = `left:${x+0.45*celda}px;top:${y-0.5*celda}px`;
    d.style.cssText=`position:fixed;${lugar};color:white;font-weight:bold;font-size:14px;text-shadow:1px 1px 2px #000;pointer-events:none`;
    document.body.appendChild(d);
  }
}

function animate(t) {
  const dt=Math.min((t-lastTime)/1000,0.05);
  lastTime=t;
  if(running) step(dt);
  draw();
  requestAnimationFrame(animate);
}

// pide la simulacion al servidor y arranca la animacion
async function start() {
  gl=glCanvas.getContext("webgl2",{alpha:false});
  if(!gl) { info.textContent="WebGL2 is not supported by this browser."; return; }

  program=makeProgram(colorVertex,colorFragment);
  textureProgram=makeProgram(vertexShaderSource,fragmentShaderSource);
  quad=makeQuad();

  const response=await fetch("/api/data" + location.search); // la url trae los parametros
  const data=await response.json();
  if (data.error) throw new Error(data.error);
  nodes=data.nodes;
  routes=data.routes;
  baterias=data.baterias;
  makeAgents();

  [robotTex,fullTex,emptyTex]=await Promise.all([
    createTexture("/static/images/hjm.png"),
    createTexture("/static/images/node_full.png"),
    createTexture("/static/images/node_empty.png")
  ]);

  resize();
  addEventListener("resize",resize);
  running=true;
  requestAnimationFrame(animate);
}

let quad, robotTex, fullTex, emptyTex;
start().catch(err=>{ console.error(err); info.textContent="Error: "+err.message; });