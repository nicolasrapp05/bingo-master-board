const prizeNames = {
  linha: "Linha",
  duas: "Duas linhas",
  cheia: "Cartela cheia"
};

const themes = {
  classic: "#d1cc85",
  red: "rgb(253, 166, 166)",
  green: "rgb(150, 206, 129)",
  blue: "rgb(139, 199, 226)",
  purple: "rgb(189, 176, 216)"
};

const ballFaces = [
  "bingoBallBall",
  "bingoBallVintage",
  "bingoBallBallActiveB",
  "bingoBallBallActiveI",
  "bingoBallBallActiveN",
  "bingoBallBallActiveG",
  "bingoBallBallActiveO",
  "bingoBallVintageActive"
];

const bigFaces = [
  "bingoBallBallActiveB",
  "bingoBallBallActiveI",
  "bingoBallBallActiveN",
  "bingoBallBallActiveG",
  "bingoBallBallActiveO",
  "bigBingoBallVintage"
];

let builtMode = "";
let seenDrawn = null;
let shownKey = "";
let shownTheme = "";
let shownPattern = "";
let shownHidden = "";
let columnsReady = false;
let lastFresh = null;
let ballNodes = [];
const ballFace = new WeakMap();

function letterOf(num) {
  if (num <= 15) return "B";
  if (num <= 30) return "I";
  if (num <= 45) return "N";
  if (num <= 60) return "G";
  return "O";
}

function colorKey(num, gameType) {
  if (gameType !== "90") return letterOf(num);
  if (num <= 18) return "B";
  if (num <= 36) return "I";
  if (num <= 54) return "N";
  if (num <= 72) return "G";
  return "O";
}

function activeClass(num, state) {
  if (state.bingoStyle === "vintage") return "bingoBallVintageActive";
  return "bingoBallBallActive" + colorKey(num, state.gameType);
}

function normalize(raw) {
  if (!raw || raw.type !== "bingo-display" || !Array.isArray(raw.drawn)) return null;
  return {
    type: "bingo-display",
    drawn: raw.drawn.map(Number),
    theme: raw.theme || "classic",
    bingoStyle: raw.bingoStyle === "vintage" ? "vintage" : "ball",
    hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
    pattern: Array.isArray(raw.pattern) ? raw.pattern.map(Number) : [],
    prize: raw.prize || "",
    gameType: raw.gameType === "90" ? "90" : "75",
    eventName: raw.eventName || "",
    useCustomColors: !!raw.useCustomColors,
    customBg: raw.customBg || "#d1cc85",
    customBall: raw.customBall || "#e36a2c",
    animSpeed: raw.animSpeed || "normal"
  };
}

function addedBall(previous, next) {
  if (!previous || next.length !== previous.length + 1) return 0;
  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== next[i]) return 0;
  }
  return next[next.length - 1];
}

function ballNode(num) {
  const ball = document.createElement("div");
  ball.className = "displayBall";
  ball.dataset.num = String(num);
  ball.textContent = String(num);
  return ball;
}

function buildBoard(gameType) {
  const board = document.getElementById("displayBoard");
  board.textContent = "";
  ballNodes = [];
  columnsReady = false;
  lastFresh = null;
  board.classList.toggle("mode90", gameType === "90");
  if (gameType === "90") {
    for (let num = 1; num <= 90; num += 1) board.appendChild(ballNode(num));
    return;
  }
  ["B", "I", "N", "G", "O"].forEach((letter, index) => {
    const column = document.createElement("section");
    column.className = "displayCol";
    column.dataset.letter = letter;
    const title = document.createElement("div");
    title.className = "displayColLetter";
    title.textContent = letter;
    const balls = document.createElement("div");
    balls.className = "displayBalls";
    for (let num = index * 15 + 1; num <= index * 15 + 15; num += 1) {
      balls.appendChild(ballNode(num));
    }
    column.appendChild(title);
    column.appendChild(balls);
    board.appendChild(column);
  });
}

function buildPattern() {
  const root = document.getElementById("displayPattern");
  const kicker = document.createElement("div");
  kicker.className = "displayKicker";
  kicker.id = "displayKicker";
  const card = document.createElement("div");
  card.className = "bingoCard";
  card.id = "displayCard";
  ["B", "I", "N", "G", "O"].forEach((letter) => {
    const head = document.createElement("div");
    head.className = "bingoCardHeader";
    head.textContent = letter;
    card.appendChild(head);
  });
  for (let row = 1; row <= 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const cell = document.createElement("div");
      cell.className = "bingoCardBody";
      cell.dataset.cell = String(column * 5 + row);
      card.appendChild(cell);
    }
  }
  const prize = document.createElement("div");
  prize.className = "displayPrize";
  prize.id = "displayPrize";
  prize.hidden = true;
  root.appendChild(kicker);
  root.appendChild(card);
  root.appendChild(prize);
}

function applyTheme(state) {
  const signature = [
    state.useCustomColors,
    state.customBall,
    state.customBg,
    state.theme,
    state.animSpeed
  ].join("|");
  if (signature === shownTheme) return;
  shownTheme = signature;
  const root = document.getElementById("display");
  root.classList.toggle("use-custom-ball", state.useCustomColors);
  root.style.setProperty("--custom-ball", state.customBall);
  root.style.background = state.useCustomColors ? state.customBg : (themes[state.theme] || themes.classic);
  const pace = state.animSpeed === "slow" ? "2.4s" : state.animSpeed === "fast" ? "0.9s" : "1.7s";
  root.style.setProperty("--callout", pace);
}

function updateBalls(state, fresh) {
  const board = document.getElementById("displayBoard");
  board.classList.toggle("vintage", state.bingoStyle === "vintage");
  const hiddenKey = state.hidden.join(",");
  if (!columnsReady || hiddenKey !== shownHidden) {
    const hidden = new Set(state.hidden);
    board.querySelectorAll(".displayCol").forEach((column) => {
      column.classList.toggle("is-hidden", hidden.has(column.dataset.letter));
    });
    shownHidden = hiddenKey;
    columnsReady = true;
  }
  if (!ballNodes.length) ballNodes = Array.from(board.querySelectorAll(".displayBall"));
  const drawn = new Set(state.drawn);
  const base = state.bingoStyle === "vintage" ? "bingoBallVintage" : "bingoBallBall";
  if (lastFresh) {
    lastFresh.classList.remove("justDrawn");
    lastFresh = null;
  }
  ballNodes.forEach((node) => {
    const num = Number(node.dataset.num);
    const active = drawn.has(num) ? activeClass(num, state) : "";
    const face = base + "|" + active;
    if (ballFace.get(node) !== face) {
      node.classList.remove(...ballFaces);
      node.classList.add(base);
      if (active) node.classList.add(active);
      ballFace.set(node, face);
    }
    if (fresh && num === fresh) {
      void node.offsetWidth;
      node.classList.add("justDrawn");
      lastFresh = node;
    }
  });
}

function updateBig(state, fresh) {
  const ball = document.getElementById("displayBall");
  const last = state.drawn.length ? state.drawn[state.drawn.length - 1] : 0;
  bigFaces.forEach((name) => ball.classList.remove(name));
  ball.classList.toggle("solo", state.gameType === "90");
  ball.classList.remove("justDrawn");
  if (!last) {
    document.getElementById("displayLetter").textContent = "\u00a0";
    document.getElementById("displayNumber").textContent = "\u00a0";
    return;
  }
  const letter = state.gameType === "90" ? "" : letterOf(last);
  document.getElementById("displayLetter").textContent = letter || "\u00a0";
  document.getElementById("displayNumber").textContent = String(last);
  if (state.bingoStyle === "vintage") ball.classList.add("bigBingoBallVintage");
  else ball.classList.add("bingoBallBallActive" + colorKey(last, state.gameType));
  if (fresh) {
    void ball.offsetWidth;
    ball.classList.add("justDrawn");
  }
}

function remainingCount(state) {
  const max = state.gameType === "90" ? 90 : 75;
  const drawn = new Set(state.drawn);
  const hidden = state.gameType === "90" ? null : new Set(state.hidden);
  let count = 0;
  for (let num = 1; num <= max; num += 1) {
    if (drawn.has(num)) continue;
    if (hidden && hidden.has(letterOf(num))) continue;
    count += 1;
  }
  return count;
}

function updatePattern(state) {
  const signature = state.gameType + "|" + state.prize + "|" + state.pattern.join(",");
  if (signature === shownPattern) return;
  shownPattern = signature;
  const card = document.getElementById("displayCard");
  const prize = document.getElementById("displayPrize");
  document.getElementById("displayKicker").textContent = state.gameType === "90" ? "Prêmio" : "Padrão";
  if (state.gameType === "90") {
    card.hidden = true;
    prize.hidden = false;
    prize.textContent = prizeNames[state.prize] || "A definir";
    return;
  }
  card.hidden = false;
  prize.hidden = true;
  const marked = new Set(state.pattern);
  card.querySelectorAll(".bingoCardBody").forEach((cell) => {
    cell.classList.toggle("bingoCardActive2", marked.has(Number(cell.dataset.cell)));
  });
}

function showCallout(num, state) {
  const root = document.getElementById("displayCallout");
  root.textContent = "";
  root.classList.add("is-on");
  const face = document.createElement("div");
  face.className = "displayCalloutBall " + activeClass(num, state);
  if (state.gameType === "90") face.classList.add("solo");
  if (state.gameType !== "90") {
    const letter = document.createElement("div");
    letter.className = "displayCalloutLetter";
    letter.textContent = letterOf(num);
    face.appendChild(letter);
  }
  const number = document.createElement("div");
  number.className = "displayCalloutNumber";
  number.textContent = String(num);
  face.appendChild(number);
  root.appendChild(face);
  face.addEventListener("animationend", () => {
    if (face.parentNode !== root) return;
    root.textContent = "";
    root.classList.remove("is-on");
  });
}

function fitBalls() {
  const board = document.getElementById("displayBoard");
  if (!board || board.clientHeight < 20) return false;
  let size = 48;
  if (board.classList.contains("mode90")) {
    const styles = getComputedStyle(board);
    const gap = parseFloat(styles.columnGap) || 0;
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const width = (board.clientWidth - padX - gap * 9) / 10;
    const height = (board.clientHeight - padY - gap * 8) / 9;
    size = Math.floor(Math.min(width, height) * 0.9);
  } else {
    const box = board.querySelector(".displayBalls");
    if (!box) return false;
    const styles = getComputedStyle(box);
    const gap = 4;
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const width = (box.clientWidth - padX - gap) / 2;
    const height = (box.clientHeight - padY - gap * 7) / 8;
    size = Math.floor(Math.min(width, height)) - 4;
  }
  if (!Number.isFinite(size) || size < 16) size = 16;
  const vintage = board.classList.contains("vintage");
  const nextBall = size + "px";
  const nextFont = Math.floor(size * (vintage ? 0.62 : 0.5)) + "px";
  if (board.style.getPropertyValue("--ball") !== nextBall) board.style.setProperty("--ball", nextBall);
  if (board.style.getPropertyValue("--ball-font") !== nextFont) board.style.setProperty("--ball-font", nextFont);
  return true;
}

function stateKey(state) {
  return [
    state.gameType,
    state.bingoStyle,
    state.theme,
    state.useCustomColors,
    state.customBg,
    state.customBall,
    state.animSpeed,
    state.eventName,
    state.prize,
    state.hidden.join(","),
    state.pattern.join(","),
    state.drawn.join(",")
  ].join("|");
}

function showState(raw) {
  const state = normalize(raw);
  if (!state) return;
  const key = stateKey(state);
  if (key === shownKey) return;
  shownKey = key;
  const stage = document.getElementById("displayStage");
  stage.hidden = false;
  document.getElementById("display").classList.add("is-live");
  applyTheme(state);
  const name = state.eventName.trim();
  const eventName = document.getElementById("displayEvent");
  eventName.textContent = name;
  eventName.hidden = !name;
  stage.classList.toggle("no-event", !name);
  if (builtMode !== state.gameType) {
    buildBoard(state.gameType);
    builtMode = state.gameType;
  }
  const fresh = addedBall(seenDrawn, state.drawn);
  updateBalls(state, fresh);
  updateBig(state, fresh);
  document.getElementById("displayRemainNum").textContent = String(remainingCount(state));
  updatePattern(state);
  if (fresh && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) showCallout(fresh, state);
  seenDrawn = state.drawn.slice();
  const fitKey = state.gameType + "|" + state.bingoStyle;
  const board = document.getElementById("displayBoard");
  if (!board.style.getPropertyValue("--ball") || board.dataset.fitKey !== fitKey) {
    board.dataset.fitKey = fitKey;
    requestAnimationFrame(() => {
      if (!fitBalls()) board.dataset.fitKey = "";
    });
  }
}

function toggleFull() {
  const root = document.getElementById("display");
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (request) {
    const pending = request.call(root);
    if (pending && pending.catch) pending.catch(() => {});
  }
}

buildPattern();

window.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "bingo-display") return;
  showState(event.data);
});

try {
  const channel = new BroadcastChannel("bingo-display");
  channel.addEventListener("message", (event) => showState(event.data));
} catch (error) {
  /* o painel também envia o estado direto para esta janela */
}

window.addEventListener("storage", (event) => {
  if (event.key !== "bingoDisplayLive" || !event.newValue) return;
  try { showState(JSON.parse(event.newValue)); } catch (error) { /* estado incompleto */ }
});

window.addEventListener("resize", fitBalls);
document.addEventListener("fullscreenchange", () => {
  document.getElementById("display").classList.toggle("is-full", !!document.fullscreenElement);
  requestAnimationFrame(fitBalls);
});
document.getElementById("displayFullEnter").addEventListener("click", toggleFull);
document.getElementById("displayFullExit").addEventListener("click", toggleFull);
document.getElementById("display").addEventListener("dblclick", (event) => {
  if (event.target.closest("button")) return;
  toggleFull();
});
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFull();
  }
});

try {
  const stored = localStorage.getItem("bingoDisplayLive");
  if (stored) showState(JSON.parse(stored));
} catch (error) {
  /* a primeira mensagem do painel preenche a tela */
}

if (window.opener) {
  window.opener.postMessage({ type: "bingo-display-ready" }, "*");
}
