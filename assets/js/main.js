const fixedWidth = document.getElementById("area").offsetWidth;
const fixedHeight = document.getElementById("area").offsetHeight;
let isFullScreen = false;
let loadedMasterBoard = false;
let keyPressed = false;

let saveData = {
  drawnBingoBalls: [],
  themeColor: "classic",
  bingoStyle: "ball",
  lastActionWasRemove: false,
  ballsDrawnRemaining: "drawn",
  hiddenBingoLetters: [],
  winningPattern: [],
  firstRun: 0,
  prize: "",
  prefs: null
}

const defaultShortcuts = {
  draw: "space",
  reset: "r",
  undo: "u",
  stats: "v",
  themes: "t",
  pattern: "w",
  config: "c",
  history: "j",
  projection: "p",
  auto: "a",
  fullscreen: "f",
  home: "h",
  display: "e",
  letterB: "b",
  letterI: "i",
  letterN: "n",
  letterG: "g",
  letterO: "o"
};

const defaultPrefs = {
  gameType: "75",
  sound: true,
  voice: true,
  volume: 100,
  autoDraw: false,
  autoInterval: 8,
  confirmReset: true,
  projection: false,
  counter: "drawn",
  openOnBoard: false,
  eventName: "",
  useCustomColors: false,
  customBg: "#d1cc85",
  customBall: "#e36a2c",
  animSpeed: "slow",
  showRecent: false,
  shortcuts: defaultShortcuts
};

const shortcutNames = {
  draw: "Sortear",
  reset: "Limpar",
  undo: "Desfazer a última bola",
  stats: "Sorteadas ou restantes",
  themes: "Aparência",
  pattern: "Padrão ou prêmio",
  config: "Configurações",
  history: "Histórico",
  projection: "Modo projeção",
  auto: "Sorteio automático",
  fullscreen: "Tela cheia",
  home: "Menu",
  display: "Tela de exibição",
  letterB: "Ocultar coluna B",
  letterI: "Ocultar coluna I",
  letterN: "Ocultar coluna N",
  letterG: "Ocultar coluna G",
  letterO: "Ocultar coluna O"
};

const prizeNames = {
  linha: "Linha",
  duas: "Duas linhas",
  cheia: "Cartela cheia"
};

const configTabs = ["Partida", "Sorteio", "Aparência", "Atalhos"];
let capturingShortcut = null;
let configReturn = "titleSlide";
let configSection = "Partida";
let confirmAction = null;
let autoTimer = null;
let audioCtx = null;
let saveTimer = 0;

if (supportsLocalStorage) {
  const storedGame = localStorage.getItem("bingoMasterBoardSaveData");
  if (storedGame) {
    try {
      const parsedData = JSON.parse(storedGame);
      if (parsedData && typeof parsedData === "object") {
        Object.keys(parsedData).forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(saveData, key)) saveData[key] = parsedData[key];
        });
      }
    } catch (error) {
      /* partida salva ilegível: o tabuleiro começa vazio */
    }
  }
}

function save() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
  if (supportsLocalStorage) {
    localStorage.setItem("bingoMasterBoardSaveData", JSON.stringify(saveData));
  }
  publishDisplay();
}

function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
}

function prefs() {
  return saveData.prefs;
}

let prefsNeedSave = false;

function ensurePrefs() {
  if (!saveData.prefs || typeof saveData.prefs !== "object") {
    saveData.prefs = {};
  }
  const stored = saveData.prefs;
  Object.keys(defaultPrefs).forEach((key) => {
    if (stored[key] === undefined) {
      stored[key] = key === "shortcuts" ? Object.assign({}, defaultShortcuts) : defaultPrefs[key];
    }
  });
  if (!stored.shortcuts || typeof stored.shortcuts !== "object") {
    stored.shortcuts = Object.assign({}, defaultShortcuts);
  }
  Object.keys(defaultShortcuts).forEach((key) => {
    if (!stored.shortcuts[key]) stored.shortcuts[key] = defaultShortcuts[key];
  });
  delete stored.shortcuts.board;
  if (stored.defaultsVersion !== 2) {
    const previousDefaults = {
      sound: true,
      volume: 70,
      confirmReset: false,
      animSpeed: "normal",
      showRecent: true
    };
    Object.keys(previousDefaults).forEach((key) => {
      if (stored[key] === previousDefaults[key]) stored[key] = defaultPrefs[key];
    });
    stored.defaultsVersion = 2;
    prefsNeedSave = true;
  }
  if (stored.defaultsVersion !== 3) {
    stored.sound = true;
    stored.voice = true;
    stored.defaultsVersion = 3;
    prefsNeedSave = true;
  }
  if (!saveData.prize) saveData.prize = "";
}

ensurePrefs();

function is90() {
  return prefs().gameType === "90";
}

function ballMax() {
  return is90() ? 90 : 75;
}

function pace(ms) {
  if (prefs().animSpeed === "slow") return Math.round(ms * 2.2);
  if (prefs().animSpeed === "fast") return Math.max(40, Math.round(ms * 0.45));
  return ms;
}

function keyLabel(key) {
  if (key === "space") return "Espaço";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function shortcutAction(key) {
  const map = prefs().shortcuts;
  const names = Object.keys(map);
  for (let i = 0; i < names.length; i += 1) {
    if (map[names[i]] === key) return names[i];
  }
  return "";
}

function shownLetter(num) {
  if (is90()) return "";
  return typeOfBingoLetter(num);
}

function pressedKey(event) {
  return event.key === " " ? "space" : event.key.toLowerCase();
}

function onShortcut(event, onBoard, handle) {
  if (keyPressed) {
    return;
  }
  const key = pressedKey(event);
  if (document.getElementById("confirmLayer").style.display === "flex") {
    event.preventDefault();
    keyPressed = true;
    if (key === "enter") onControlClick({ target: document.getElementById("confirmYes") });
    else if (key === "escape") closeConfirm();
    return;
  }
  if (capturingShortcut) {
    event.preventDefault();
    keyPressed = true;
    finishCapture(key);
    return;
  }
  const drawKey = prefs().shortcuts.draw;
  const focusedButton = event.target.closest("button");
  const buttonOwnsKey = focusedButton && (key === "enter" || (key === "space" && !(onBoard && key === drawKey)));
  if (buttonOwnsKey) {
    event.preventDefault();
    keyPressed = true;
    focusedButton.click();
    return;
  }
  if (shortcutAction(key) === "fullscreen") {
    event.preventDefault();
    keyPressed = true;
    toggleFullScreen();
    return;
  }
  if (shortcutAction(key) === "display") {
    event.preventDefault();
    keyPressed = true;
    openDisplay();
    return;
  }
  if (!handle(key)) {
    if (key === "space") {
      event.preventDefault();
    }
    return;
  }
  event.preventDefault();
  keyPressed = true;
}

function runBoardShortcut(key) {
  const action = shortcutAction(key);
  if (action === "draw") { randomDraw(); return true; }
  if (action === "reset") { requestReset(); return true; }
  if (action === "undo") { undoLastBall(); return true; }
  if (action === "themes") { openConfig("masterBoardSlide", "Aparência"); return true; }
  if (action === "pattern") { hide("masterBoardSlide"); show("winningPatternSlide", "grid"); return true; }
  if (action === "stats") { toggleBallsDrawnRemaining("toggle"); return true; }
  if (action === "home") { hide("masterBoardSlide"); show("titleSlide"); return true; }
  if (action === "config") { openConfig("masterBoardSlide"); return true; }
  if (action === "history") { openHistory(); return true; }
  if (action === "projection") { setPref("projection", !prefs().projection); return true; }
  if (action === "auto") { setPref("autoDraw", !prefs().autoDraw); return true; }
  if (!is90() && action === "letterB") { hideBingo("B", "toggle"); return true; }
  if (!is90() && action === "letterI") { hideBingo("I", "toggle"); return true; }
  if (!is90() && action === "letterN") { hideBingo("N", "toggle"); return true; }
  if (!is90() && action === "letterG") { hideBingo("G", "toggle"); return true; }
  if (!is90() && action === "letterO") { hideBingo("O", "toggle"); return true; }
  return false;
}

function onControlClick(event) {
  const control = event.target.closest("[data-action]");
  if (!control) {
    return;
  }
  const action = control.dataset.action;
  if (action === "draw") {
    randomDraw();
  } else if (action === "fullscreen") {
    toggleFullScreen();
  } else if (action === "home") {
    hide("masterBoardSlide");
    show("titleSlide");
  } else if (action === "navigate") {
    if (control.dataset.before === "apply-pattern" && !is90()) {
      hideBingoLettersBasedOnWinningPattern();
    }
    hide(control.dataset.hide);
    show(control.dataset.show, control.dataset.display);
  } else if (action === "nav-help") {
    navHelp(control.dataset.section);
  } else if (action === "reset") {
    requestReset();
  } else if (action === "undo") {
    undoLastBall();
  } else if (action === "open-config") {
    openConfig(control.dataset.return || "titleSlide", control.dataset.section);
  } else if (action === "close-config") {
    closeConfig();
  } else if (action === "open-history") {
    openHistory();
  } else if (action === "close-history") {
    hide("historySlide");
    show("masterBoardSlide", "grid");
  } else if (action === "nav-config") {
    navConfig(control.dataset.section);
  } else if (action === "pref-choice") {
    const raw = control.dataset.value;
    const prefName = control.dataset.choice;
    setPref(prefName, prefName === "autoInterval" ? Number(raw) : raw);
  } else if (action === "pref-switch") {
    setPref(control.dataset.switch, !prefs()[control.dataset.switch]);
  } else if (action === "shortcut-edit") {
    capturingShortcut = control.dataset.shortcut;
    renderShortcutList();
  } else if (action === "restore-shortcuts") {
    prefs().shortcuts = Object.assign({}, defaultShortcuts);
    save();
    renderShortcutList();
    renderHelpShortcuts();
  } else if (action === "confirm-yes") {
    const next = confirmAction;
    closeConfirm();
    if (next) next();
  } else if (action === "confirm-no") {
    closeConfirm();
    renderConfig();
  } else if (action === "stop-auto") {
    setPref("autoDraw", false);
  } else if (action === "set-prize") {
    setPrize(control.dataset.prize);
  } else if (action === "exit-projection") {
    setPref("projection", false);
  } else if (action === "open-display") {
    openDisplay();
  } else if (action === "toggle-stats") {
    toggleBallsDrawnRemaining("toggle");
  } else if (action === "hide-letter") {
    hideBingo(control.dataset.letter, "toggle");
  } else if (action === "ball") {
    activateBingoBall(Number(control.id.replace("bingo", "")));
  } else if (action === "theme") {
    changeBackgroundColor(control.dataset.theme);
  } else if (action === "style") {
    changeBingoStyle(control.dataset.style);
  } else if (action === "pattern-cell") {
    toggleWinningPattern(Number(control.dataset.cell));
  } else if (action === "pattern-name") {
    const cells = control.dataset.cells ? control.dataset.cells.split(",").map(Number) : [];
    winningPatternFromName(...cells);
  }
  const active = document.activeElement;
  if (active && active !== document.body && active.getClientRects().length === 0) {
    active.blur();
  }
}

const ballActiveClasses = [
  "bingoBallBallActiveB",
  "bingoBallBallActiveI",
  "bingoBallBallActiveN",
  "bingoBallBallActiveG",
  "bingoBallBallActiveO",
  "bingoBallVintageActive"
];

const ballFaceClasses = ["bingoBallBall", "bingoBallVintage"].concat(ballActiveClasses);

const bigBallFaceClasses = [
  "bingoBallBallActiveB",
  "bingoBallBallActiveI",
  "bingoBallBallActiveN",
  "bingoBallBallActiveG",
  "bingoBallBallActiveO",
  "bigBingoBallVintage"
];

function clearBallFace(element) {
  element.classList.remove(...ballFaceClasses);
}

function clearBallActive(element) {
  element.classList.remove(...ballActiveClasses);
}

function clearBigBallFace() {
  document.getElementById("bigBingoBall").classList.remove(...bigBallFaceClasses);
}

function init() {
	resize();
	window.addEventListener('resize', resize);
	document.addEventListener("fullscreenchange", onFullScreenChange, false);
	document.addEventListener("webkitfullscreenchange", onFullScreenChange, false);
	onFullScreenChange();
	document.addEventListener("click", onControlClick);
  bindPreferenceInputs();
  ensureExtraBalls();
  renderHelpShortcuts();
  applyAllPrefs();
  let param = location.search;
  const openBoard = param === "?masterboard" || (prefs().openOnBoard && saveData.firstRun !== 0);
  if (openBoard) {
    setTimeout(() => {
      hide("titleSlide");
      show("fullScreenToggleLayer");
  		show("masterBoardSlide", "grid");
  	},50);
  } else if (saveData.firstRun === 0 && supportsLocalStorage) {
    saveData.firstRun = 1;
    save();
    setTimeout(() => {
      hide("titleSlide");
      show("fullScreenToggleLayer");
      show("onboardingSlide");
    },50);
  } else {
    setTimeout(() => {
      show("fullScreenToggleLayer");
      show("titleSlide");
    },50);
  }
  document.onkeyup = function() {
    keyPressed = false;
  }
  const img1 = new Image();
  const img2 = new Image();
  const img3 = new Image();
  img1.src = "./assets/img/fullscreenUpHover.svg";
  img2.src = "./assets/img/fullscreenDownHover.svg";
  img3.src = "./assets/img/homeButtonHover.svg";
}

const scaledViews = ["area", "fader", "fullScreenToggleLayer", "drawBallLayer"].map((id) => document.getElementById(id));

function resize() {
  const scale = (window.innerHeight / window.innerWidth) < (fixedHeight / fixedWidth)
    ? window.innerHeight / fixedHeight
    : window.innerWidth / fixedWidth;
  const transform = "scale(" + scale + ")";
  for (let i = 0; i < scaledViews.length; i += 1) {
    scaledViews[i].style.transform = transform;
  }
}

function onFullScreenChange() {
  var fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
  if (fullscreenElement === null || fullscreenElement === undefined) {
    isFullScreen = false;
  } else {
    isFullScreen = true;
  }
  changeFullScreenImg();
}

function show(elementName, display) {
  document.getElementById("fader").classList.add("notransition");
  document.getElementById("fader").style.opacity = "1";
	if (display === "flex") {
	  document.getElementById(elementName).style.display = "flex";
	} else if (display === "grid") {
	  document.getElementById(elementName).style.display = "grid";
	} else {
	  document.getElementById(elementName).style.display = "block";
	}
	if (elementName === "masterBoardSlide") {
		changeBG(saveData.themeColor);
		document.getElementById("drawBallLayer").style.display = "block";
		document.getElementById("fullScreenToggle").classList.add("fullScreenToggleSmall");
		document.getElementById("homeButton").style.display = "block";
    if (loadedMasterBoard === false) {
      setUpMasterBoard();
      loadedMasterBoard = true;
    }
    applyAllPrefs();
    document.onkeydown = function(e) {
      onShortcut(e, true, runBoardShortcut);
    }
	}
  else if (elementName === "winningPatternSlide") {
    syncPatternView();
    document.onkeydown = function(e) {
      onShortcut(e, false, (key) => {
        if (shortcutAction(key) === "pattern" || key === "enter") {
          if (!is90()) hideBingoLettersBasedOnWinningPattern();
          hide("winningPatternSlide");
          show("masterBoardSlide", "grid");
          return true;
        }
        return false;
      });
    }
  }
  else if (elementName === "titleSlide") {
    document.onkeydown = function(e) {
      onShortcut(e, false, (key) => {
        if (key === "enter") { hide("titleSlide"); show("masterBoardSlide", "grid"); return true; }
        if (shortcutAction(key) === "config") { openConfig("titleSlide"); return true; }
        return false;
      });
    }
  }
  else if (elementName === "howToUseSlide") {
    renderHelpShortcuts();
    document.onkeydown = function(e) {
      onShortcut(e, false, (key) => {
        if (key === "arrowleft") { keyboardNavHowToUse(0); return true; }
        if (key === "arrowright") { keyboardNavHowToUse(1); return true; }
        if (key === "enter") { hide("howToUseSlide"); show("titleSlide"); return true; }
        return false;
      });
    }
  }
  else if (elementName === "configSlide") {
    renderConfig();
    document.onkeydown = function(e) {
      onShortcut(e, false, (key) => {
        if (key === "arrowleft") { stepConfig(-1); return true; }
        if (key === "arrowright") { stepConfig(1); return true; }
        if (shortcutAction(key) === "themes") {
          if (configSection === "Aparência") closeConfig();
          else navConfig("Aparência");
          return true;
        }
        if (key === "enter" || shortcutAction(key) === "config") { closeConfig(); return true; }
        return false;
      });
    }
  }
  else if (elementName === "historySlide") {
    renderHistory();
    document.onkeydown = function(e) {
      onShortcut(e, false, (key) => {
        if (key === "enter" || shortcutAction(key) === "history") { hide("historySlide"); show("masterBoardSlide", "grid"); return true; }
        return false;
      });
    }
  }
  else {
    document.onkeydown = function(e) {
      onShortcut(e, false, () => false);
    }
  }
	setTimeout(() => {
	  document.getElementById("fader").classList.remove("notransition");
	  document.getElementById("fader").style.opacity = "0";
	},50);
}

function hide(elementName) {
  document.getElementById(elementName).style.display = "none";
	if (elementName === "masterBoardSlide") {
		changeBG();
		document.getElementById("drawBallLayer").style.display = "none";
		document.getElementById("fullScreenToggle").classList.remove("fullScreenToggleSmall");
		document.getElementById("homeButton").style.display = "none";
    syncAutoDraw();
	}
}

function toggleFullScreen() {
	const canvas = document.body;
	let pending;
	if (isFullScreen === false) {
		if (canvas.requestFullscreen) {
			pending = canvas.requestFullscreen();
		} else if (canvas.webkitRequestFullscreen) {
			pending = canvas.webkitRequestFullscreen();
		}
	} else if (document.exitFullscreen) {
		pending = document.exitFullscreen();
	} else if (document.webkitExitFullscreen) {
		pending = document.webkitExitFullscreen();
	}
	if (pending && typeof pending.catch === "function") {
		pending.catch(() => {});
	}
}

function changeFullScreenImg() {
  if (isFullScreen === false) {
    document.getElementById("fullScreenButton").style.display = "block";
    document.getElementById("fullScreenButtonDown").style.display = "none";
  } else {
    document.getElementById("fullScreenButton").style.display = "none";
    document.getElementById("fullScreenButtonDown").style.display = "block";
  }
}

function changeBG(color) {
  let newColor;
  if (color && prefs().useCustomColors) {
    const bg = prefs().customBg;
    document.getElementById("area").style.background = bg;
    document.getElementById("fader").style.background = bg;
    return;
  }
  if (color === "classic") {
    newColor = "#d1cc85";
  } else if (color === "red") {
    newColor = "rgb(253, 166, 166)";
  } else if (color === "green") {
    newColor = "rgb(150, 206, 129)";
  } else if (color === "blue") {
    newColor = "rgb(139, 199, 226)";
  } else if (color === "purple") {
    newColor = "rgb(189, 176, 216)";
  } else {
    newColor = "radial-gradient(#f7eaab, #bfbb73)";
  }
	document.getElementById("area").style.background=newColor;
	document.getElementById("fader").style.background=newColor;
}

function activateBingoBall(bingoIDNum) {
  let typeOfBingoBall = typeOfBingo(bingoIDNum);
  let typeOfBingoBallLetter = shownLetter(bingoIDNum);
  let bingoID = bingoIDNum + "bingo";
	if (saveData.drawnBingoBalls.indexOf(bingoIDNum) === -1) {
		document.getElementById(bingoID).classList.add(typeOfBingoBall);
    clearBigBallFace();
    if (saveData.bingoStyle === "ball") {
    document.getElementById("bigBingoBall").classList.add(typeOfBingoBall);
    } else {
      document.getElementById("bigBingoBall").classList.add("bigBingoBallVintage");
    }
    document.getElementById("bigBingoLetter").textContent=typeOfBingoBallLetter || "\u00a0";
    document.getElementById("bigBingoNumber").textContent=bingoIDNum;
    document.getElementById("bigBingoNumber").style.fontSize=104+"px";
    setTimeout(() => {
      document.getElementById("bigBingoNumber").style.fontSize=95+"px";
    }, pace(100));
    saveData.drawnBingoBalls.push(bingoIDNum);
    saveData.lastActionWasRemove = false;
    save();
	} else {
		document.getElementById(bingoID).classList.remove(typeOfBingoBall);
    clearBigBallFace();
    document.getElementById("bigBingoLetter").textContent="\u00a0";
    document.getElementById("bigBingoNumber").textContent="\u00a0";
    saveData.drawnBingoBalls.splice(saveData.drawnBingoBalls.indexOf(bingoIDNum), 1);
    saveData.lastActionWasRemove = true;
    save();
	}
  updateBallStats();
}

function colorLetter(num) {
  if (!is90()) return typeOfBingoLetter(num);
  if (num <= 18) return "B";
  if (num <= 36) return "I";
  if (num <= 54) return "N";
  if (num <= 72) return "G";
  return "O";
}

function typeOfBingo(num) {
  if (saveData.bingoStyle === "vintage") {
    return "bingoBallVintageActive";
  }
  return "bingoBallBallActive" + colorLetter(num);
}

function typeOfBingoLetter(num) {
  if (num <= 15){
    return "B";
  } else if (num <= 30) {
    return "I";
  } else if (num <= 45) {
    return "N";
  } else if (num <= 60) {
    return "G";
  } else {
    return "O";
  }
}

function loadBingoBall(bingoIDNum) {
  let typeOfBingoBall = typeOfBingo(bingoIDNum);
  let bingoID = bingoIDNum + "bingo";
		document.getElementById(bingoID).classList.add(typeOfBingoBall);
  if (saveData.drawnBingoBalls.indexOf(bingoIDNum) === saveData.drawnBingoBalls.length-1 && saveData.lastActionWasRemove === false) {
    let typeOfBingoBallLetter = shownLetter(bingoIDNum);
    clearBigBallFace();
    if (saveData.bingoStyle === "ball") {
    document.getElementById("bigBingoBall").classList.add(typeOfBingoBall);
    } else {
      document.getElementById("bigBingoBall").classList.add("bigBingoBallVintage");
    }
    document.getElementById("bigBingoLetter").textContent=typeOfBingoBallLetter || "\u00a0";
    document.getElementById("bigBingoNumber").textContent=bingoIDNum;
  }
}

function renderBingoStyle() {
  const styleClass = saveData.bingoStyle === "ball" ? "bingoBallBall" : "bingoBallVintage";
  for (let i = 1; i <= 90; i += 1) {
    const ball = document.getElementById(i + "bingo");
    if (!ball) continue;
    clearBallFace(ball);
    ball.classList.add(styleClass);
  }
}

function changeBingoStyle(theStyle) {
  saveData.bingoStyle = theStyle;
  save();
  renderBingoStyle();
  for (let i=0;i<saveData.drawnBingoBalls.length;i+=1) {
    loadBingoBall(saveData.drawnBingoBalls[i]);
  }
  setUpSettings();
}

function getBallsRemaining() {
  const drawn = new Set(saveData.drawnBingoBalls);
  const hidden = is90() ? null : new Set(saveData.hiddenBingoLetters);
  const numbersAvailable = [];
  const max = ballMax();
  for (let i = 1; i <= max; i += 1) {
    if (drawn.has(i)) continue;
    if (hidden && hidden.has(typeOfBingoLetter(i))) continue;
    numbersAvailable.push(i);
  }
  return numbersAvailable;
}

function randomDraw() {
  const remaining = getBallsRemaining();
  const drawButton = document.getElementById("drawBallDiv");
  if (remaining.length === 0) {
    drawButton.style.transform = "rotate(15deg)";
    setTimeout(() => {
      drawButton.style.transform = "rotate(0deg)";
    }, pace(100));
    prefs().autoDraw = false;
    save();
    syncAutoDraw();
    applyAllPrefs();
  } else {
    drawButton.style.transform = "scale(0.9)";
    drawButton.style.opacity = 0.6;
    setTimeout(() => {
      drawButton.style.transform = "scale(1)";
      drawButton.style.opacity = 1;
    }, pace(100));
    const theRandomNumber = remaining[cryptoRandom(0, remaining.length - 1)];
    activateBingoBall(theRandomNumber);
    playDrawSound(theRandomNumber);
  }
}

function cryptoRandom(min, max) {
  const cryptoRandomSet = new Uint32Array(1);
  window.crypto.getRandomValues(cryptoRandomSet);
  const cryptoRandomNumber = cryptoRandomSet[0] / (4294967295 + 1);
  return Math.floor(cryptoRandomNumber * (max - min + 1)) + min;
}

function updateBallStats() {
  const ballsRemaining = getBallsRemaining().length;
  const hiddenCount = is90() ? 0 : saveData.hiddenBingoLetters.length * 15;
  document.getElementById("ballsDrawnNum").textContent = ballMax() - hiddenCount - ballsRemaining;
  document.getElementById("ballsRemainingNum").textContent = ballsRemaining;
  syncUndo();
  renderRecent();
  if (document.getElementById("historySlide").style.display === "grid") renderHistory();
}

function hideBingo(bingoLetter, renderOrToggle) {
  let bingoLetterClass;
  let bingoBallsClass;
  if (bingoLetter === "B") {
    bingoLetterClass = "bingoB";
    bingoBallsClass = "bingoBallsB";
  }
  else if (bingoLetter === "I") {
    bingoLetterClass = "bingoI";
    bingoBallsClass = "bingoBallsI";
  }
  else if (bingoLetter === "N") {
    bingoLetterClass = "bingoN";
    bingoBallsClass = "bingoBallsN";
  }
  else if (bingoLetter === "G") {
    bingoLetterClass = "bingoG";
    bingoBallsClass = "bingoBallsG";
  }
  else if (bingoLetter === "O") {
    bingoLetterClass = "bingoO";
    bingoBallsClass = "bingoBallsO";
  }

  if (renderOrToggle === "toggle") {
    if (saveData.hiddenBingoLetters.indexOf(bingoLetter) === -1) {
      document.getElementById(bingoLetterClass).classList.add("bingoLetterGray");
      document.getElementById(bingoBallsClass).style.display = "none";
      saveData.hiddenBingoLetters.push(bingoLetter);
      save();
    } else {
      document.getElementById(bingoLetterClass).classList.remove("bingoLetterGray");
      document.getElementById(bingoBallsClass).style.display = "block";
      saveData.hiddenBingoLetters.splice(saveData.hiddenBingoLetters.indexOf(bingoLetter), 1);
      save();
    }
    updateBallStats();
  }

  else if (renderOrToggle === "render") {
    if (saveData.hiddenBingoLetters.indexOf(bingoLetter) === -1) {
      document.getElementById(bingoLetterClass).classList.remove("bingoLetterGray");
      document.getElementById(bingoBallsClass).style.display = "block";
    } else {
      document.getElementById(bingoLetterClass).classList.add("bingoLetterGray");
      document.getElementById(bingoBallsClass).style.display = "none";
    }
  }

  else if (renderOrToggle === "reset") {
    saveData.hiddenBingoLetters = [];
    save();
    const letters = ['B', 'I', 'N', 'G', 'O'];
    for (let i = 0; i< letters.length; i+=1) {
      hideBingo(letters[i], "render");
    }
  }

}

function showCounter(mode) {
  document.getElementById("ballsDrawn").style.display = mode === "drawn" ? "flex" : "none";
  document.getElementById("ballsRemaining").style.display = mode === "remaining" ? "flex" : "none";
  document.getElementById("ballsDrawnRemaining").style.visibility = mode === "hidden" ? "hidden" : "visible";
}

function toggleBallsDrawnRemaining(renderOrToggle) {
  if (renderOrToggle === "toggle") {
    if (saveData.ballsDrawnRemaining === "hidden") {
      saveData.ballsDrawnRemaining = "drawn";
    } else if (saveData.ballsDrawnRemaining === "drawn") {
      saveData.ballsDrawnRemaining = "remaining";
    } else {
      saveData.ballsDrawnRemaining = "hidden";
    }
    save();
  }
  showCounter(saveData.ballsDrawnRemaining);
}

function resetBoard() {
  for (let i = 1; i <= 90; i += 1) {
    const ball = document.getElementById(i + "bingo");
    if (ball) clearBallActive(ball);
  }
  clearBigBallFace();
  document.getElementById("bigBingoLetter").textContent="\u00a0";
  document.getElementById("bigBingoNumber").textContent="\u00a0";
  const bingoBallsClass = document.querySelectorAll(".bingoBalls");
  for (let i = 0; i < bingoBallsClass.length; i+=1) {
    bingoBallsClass[i].classList.add("notransition");
    bingoBallsClass[i].style.opacity = 0;
    setTimeout(() => {
      bingoBallsClass[i].classList.remove("notransition");
      bingoBallsClass[i].style.opacity = 1;
    },100)
  }
  saveData.drawnBingoBalls = [];
  saveData.lastActionWasRemove = false;
  save();
  hideBingo("", "reset");
  clearWinningPattern();
  updateBallStats();
}

function setUpMasterBoard() {
  applyGameLayout();
  saveData.ballsDrawnRemaining = prefs().counter;
  renderBingoStyle();
  for (let i=0;i<saveData.drawnBingoBalls.length;i+=1) {
    loadBingoBall(saveData.drawnBingoBalls[i]);
  }
  for (let i=0;i<saveData.hiddenBingoLetters.length;i+=1) {
    hideBingo(saveData.hiddenBingoLetters[i], "render");
  }
  for (let i=0;i<saveData.winningPattern.length;i+=1) {
    document.getElementById(saveData.winningPattern[i] + "card").classList.add("bingoCardActive2");
    document.getElementById(saveData.winningPattern[i] + "bigcard").classList.add("bingoCardActive");
  }
  toggleBallsDrawnRemaining("render");
  updateBallStats();
}

function setUpSettings() {
  document.getElementById("classic").style.backgroundColor = "";
  document.getElementById("red").style.backgroundColor = "";
  document.getElementById("green").style.backgroundColor = "";
  document.getElementById("blue").style.backgroundColor = "";
  document.getElementById("purple").style.backgroundColor = "";
  document.getElementById("bingoStyleBall").style.backgroundColor = "";
  document.getElementById("bingoStyleVintage").style.backgroundColor = "";
  if (saveData.themeColor === "classic") {
    document.getElementById("classic").style.backgroundColor = "rgba(148,138,84,0.28)";
  } else if (saveData.themeColor === "red") {
    document.getElementById("red").style.backgroundColor = "rgba(255,0,0,0.2)";
  } else if (saveData.themeColor === "green") {
    document.getElementById("green").style.backgroundColor = "rgba(0,128,0,0.2)";
  } else if (saveData.themeColor === "blue") {
    document.getElementById("blue").style.backgroundColor = "rgba(51,102,255,0.2)";
  } else if (saveData.themeColor === "purple") {
    document.getElementById("purple").style.backgroundColor = "rgba(164,70,153,0.2)";
  }
  if (saveData.bingoStyle === "ball") {
    document.getElementById("bingoStyleBall").style.backgroundColor = "rgba(0,0,0,0.15)";
  } else if (saveData.bingoStyle === "vintage") {
    document.getElementById("bingoStyleVintage").style.backgroundColor = "rgba(0,0,0,0.15)";
  }
}

function changeBackgroundColor(theColor) {
  saveData.themeColor = theColor;
  if (prefs().useCustomColors) prefs().useCustomColors = false;
  save();
  applyAllPrefs();
  renderConfig();
}

function toggleWinningPattern(theNumber, persist) {
  let bingoID = theNumber + "bigcard";
  let bingoID2 = theNumber + "card";
  if (saveData.winningPattern.indexOf(theNumber) === -1) {
    document.getElementById(bingoID).classList.add("bingoCardActive");
    document.getElementById(bingoID2).classList.add("bingoCardActive2");
    saveData.winningPattern.push(theNumber);
  } else {
    saveData.winningPattern.splice(saveData.winningPattern.indexOf(theNumber), 1);
    document.getElementById(bingoID).classList.remove("bingoCardActive");
    document.getElementById(bingoID2).classList.remove("bingoCardActive2");
  }
  if (persist !== false) save();
}

function winningPatternFromName(...cells) {
  clearWinningPattern(false);
  for (let i = 0; i < cells.length; i += 1) {
    toggleWinningPattern(cells[i], false);
  }
  save();
}

function clearWinningPattern(persist) {
  for (let i=0;i<saveData.winningPattern.length;i+=1) {
    document.getElementById(saveData.winningPattern[i] + "card").classList.remove("bingoCardActive2");
    document.getElementById(saveData.winningPattern[i] + "bigcard").classList.remove("bingoCardActive");
  }
  saveData.winningPattern = [];
  if (persist !== false) save();
}

function hideBingoLettersBasedOnWinningPattern() {
  let bExists = false;
  let iExists = false;
  let nExists = false;
  let gExists = false;
  let oExists = false;
  if (saveData.winningPattern.length > 0) {
    for (let i=0;i<saveData.winningPattern.length;i+=1) {
      if (saveData.winningPattern[i] <=5) {
        bExists = true;
      } else if (saveData.winningPattern[i] <=10) {
        iExists = true;
      } else if (saveData.winningPattern[i] <=15) {
        nExists = true;
      } else if (saveData.winningPattern[i] <=20) {
        gExists = true;
      } else if (saveData.winningPattern[i] <=25) {
        oExists = true;
      }
    }
    hideBingo("", "reset");
    if (bExists === false) {
      hideBingo('B', 'toggle');
    }
    if (iExists === false) {
      hideBingo('I', 'toggle');
    }
    if (nExists === false) {
      hideBingo('N', 'toggle');
    }
    if (gExists === false) {
      hideBingo('G', 'toggle');
    }
    if (oExists === false) {
      hideBingo('O', 'toggle');
    }
  }
}

function navHelp(sectionName) {
  document.getElementById("howToUseBasics").style.display="none";
  document.getElementById("howToUseBasicsHeader").classList.remove("boldHelp");
  document.getElementById("howToUseBasics2").style.display="none";
  document.getElementById("howToUseBasics2Header").classList.remove("boldHelp");
  document.getElementById("howToUseTipsTricks").style.display="none";
  document.getElementById("howToUseTipsTricksHeader").classList.remove("boldHelp");

  if (sectionName === "Básico") {
    document.getElementById("howToUseBasics").style.display="flex";
    document.getElementById("howToUseBasicsHeader").classList.add("boldHelp");
    document.getElementById("helpNavLine").style.marginLeft = 0 + "px";
  } else if (sectionName === "Básico 2") {
    document.getElementById("howToUseBasics2").style.display="flex";
    document.getElementById("howToUseBasics2Header").classList.add("boldHelp");
    document.getElementById("helpNavLine").style.marginLeft = 180 + "px";
  } else if (sectionName === "Atalhos") {
    document.getElementById("howToUseTipsTricks").style.display="flex";
    document.getElementById("howToUseTipsTricksHeader").classList.add("boldHelp");
    document.getElementById("helpNavLine").style.marginLeft = 360 + "px";
  }
}

function ensureExtraBalls() {
  const board = document.getElementById("board90");
  for (let n = 76; n <= 90; n += 1) {
    if (document.getElementById(n + "bingo")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bingoBall bingoBallBall";
    button.id = n + "bingo";
    button.dataset.action = "ball";
    button.textContent = String(n);
    board.appendChild(button);
  }
}

function applyGameLayout() {
  ensureExtraBalls();
  const slide = document.getElementById("masterBoardSlide");
  slide.classList.toggle("mode90", is90());
  if (is90()) {
    const board = document.getElementById("board90");
    for (let n = 1; n <= 90; n += 1) {
      board.appendChild(document.getElementById(n + "bingo"));
    }
    return;
  }
  const columns = [
    ["bingoBallsB", 1, 15],
    ["bingoBallsI", 16, 30],
    ["bingoBallsN", 31, 45],
    ["bingoBallsG", 46, 60],
    ["bingoBallsO", 61, 75]
  ];
  columns.forEach((column) => {
    const parent = document.getElementById(column[0]);
    for (let n = column[1]; n <= column[2]; n += 1) {
      parent.appendChild(document.getElementById(n + "bingo"));
    }
  });
}

function syncUndo() {
  const button = document.getElementById("undo");
  if (button) button.disabled = saveData.drawnBingoBalls.length === 0;
}

function updatePrizeLabel() {
  const label = document.getElementById("prizeLabel");
  if (label) label.textContent = prizeNames[saveData.prize] || "Escolher";
  document.querySelectorAll(".prizeChoice").forEach((button) => {
    button.classList.toggle("on", button.dataset.prize === saveData.prize);
  });
}

function syncPatternView() {
  document.getElementById("pattern75View").style.display = is90() ? "none" : "";
  document.getElementById("pattern90View").style.display = is90() ? "flex" : "none";
  document.querySelector("#winningPatternSlide h2").textContent = is90() ? "Prêmio" : "Padrão vencedor";
  updatePrizeLabel();
}

function setPrize(prize) {
  saveData.prize = saveData.prize === prize ? "" : prize;
  save();
  updatePrizeLabel();
}

function renderRecent() {
  const root = document.getElementById("recentBalls");
  if (!root) return;
  root.textContent = "";
  const show = prefs().projection && prefs().showRecent && saveData.drawnBingoBalls.length > 0;
  root.style.display = show ? "flex" : "none";
  if (!show) return;
  saveData.drawnBingoBalls.slice(-6).forEach((num) => {
    const chip = document.createElement("div");
    chip.className = "recentChip";
    chip.textContent = String(num);
    root.appendChild(chip);
  });
}

function renderHistory() {
  const root = document.getElementById("historyList");
  root.textContent = "";
  if (!saveData.drawnBingoBalls.length) {
    const empty = document.createElement("p");
    empty.className = "historyEmpty";
    empty.textContent = "Nenhuma bola sorteada ainda.";
    root.appendChild(empty);
    return;
  }
  saveData.drawnBingoBalls.forEach((num, index) => {
    const chip = document.createElement("div");
    chip.className = "historyChip" + (index === saveData.drawnBingoBalls.length - 1 ? " latest" : "");
    const letter = shownLetter(num);
    chip.textContent = letter ? letter + "-" + num : String(num);
    root.appendChild(chip);
  });
}

function applyAllPrefs() {
  const area = document.getElementById("area");
  area.classList.toggle("anim-slow", prefs().animSpeed === "slow");
  area.classList.toggle("anim-fast", prefs().animSpeed === "fast");
  area.style.setProperty("--custom-ball", prefs().customBall);
  area.classList.toggle("use-custom-ball", !!prefs().useCustomColors);
  const eventName = document.getElementById("eventName");
  const name = prefs().eventName.trim();
  eventName.textContent = name;
  eventName.style.display = name ? "block" : "none";
  const slide = document.getElementById("masterBoardSlide");
  slide.classList.toggle("has-event", !!name);
  slide.classList.toggle("projection", !!prefs().projection);
  slide.classList.toggle("auto-on", !!prefs().autoDraw);
  document.getElementById("pattern75").style.display = is90() ? "none" : "";
  document.getElementById("pattern90").style.display = is90() ? "flex" : "none";
  document.getElementById("autoStop").textContent = "Parar automático · " + prefs().autoInterval + "s";
  document.getElementById("bigBingoBall").classList.toggle("soloNumber", is90());
  document.getElementById("bigBingoLetter").style.display = is90() ? "none" : "";
  updatePrizeLabel();
  syncUndo();
  renderRecent();
  if (slide.style.display === "grid") changeBG(saveData.themeColor);
  syncAutoDraw();
}

function syncAutoDraw() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  const onBoard = document.getElementById("masterBoardSlide").style.display === "grid";
  const confirming = document.getElementById("confirmLayer").style.display === "flex";
  if (!(prefs().autoDraw && onBoard && !confirming)) return;
  autoTimer = setInterval(() => {
    if (!getBallsRemaining().length) {
      prefs().autoDraw = false;
      save();
      applyAllPrefs();
      renderConfig();
      return;
    }
    randomDraw();
  }, prefs().autoInterval * 1000);
}

function ensureAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const start = () => {
    if (ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 740;
    const volume = Math.max(0.04, Number(prefs().volume) / 100) * 0.35;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  };
  if (ctx.state === "suspended") {
    ctx.resume().then(start);
  } else {
    start();
  }
}

function speakNumber(num) {
  if (!window.speechSynthesis) return;
  const letter = shownLetter(num);
  const utter = new SpeechSynthesisUtterance(letter ? letter + " " + num : String(num));
  utter.lang = "pt-BR";
  utter.volume = Math.max(0, Math.min(1, Number(prefs().volume) / 100));
  utter.rate = prefs().animSpeed === "fast" ? 1.15 : prefs().animSpeed === "slow" ? 0.9 : 1;
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang && voice.lang.toLowerCase().indexOf("pt") === 0);
  if (voices.length) utter.voice = voices[0];
  window.speechSynthesis.cancel();
  window.setTimeout(() => {
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utter);
  }, 80);
}

function playDrawSound(num) {
  if (prefs().sound) playTone();
  if (prefs().voice) speakNumber(num);
}

function askConfirm(text, yesLabel, action) {
  confirmAction = action;
  document.getElementById("confirmText").textContent = text;
  document.getElementById("confirmYes").textContent = yesLabel;
  document.getElementById("confirmLayer").style.display = "flex";
  syncAutoDraw();
}

function closeConfirm() {
  confirmAction = null;
  document.getElementById("confirmLayer").style.display = "none";
  syncAutoDraw();
}

function requestReset() {
  if (prefs().confirmReset) {
    askConfirm("Limpar todas as bolas sorteadas?", "Limpar", resetBoard);
    return;
  }
  resetBoard();
}

function showLastDrawnBall() {
  const balls = saveData.drawnBingoBalls;
  if (!balls.length) return;
  const num = balls[balls.length - 1];
  clearBigBallFace();
  document.getElementById("bigBingoBall").classList.add(saveData.bingoStyle === "ball" ? typeOfBingo(num) : "bigBingoBallVintage");
  document.getElementById("bigBingoLetter").textContent = shownLetter(num) || "\u00a0";
  document.getElementById("bigBingoNumber").textContent = num;
  saveData.lastActionWasRemove = false;
  save();
}

function undoLastBall() {
  if (!saveData.drawnBingoBalls.length) return;
  activateBingoBall(saveData.drawnBingoBalls[saveData.drawnBingoBalls.length - 1]);
  showLastDrawnBall();
}

function setPref(key, value) {
  if (key === "gameType" && value !== prefs().gameType) {
    const apply = () => {
      clearWinningPattern();
      prefs().gameType = value;
      saveData.drawnBingoBalls = [];
      saveData.hiddenBingoLetters = [];
      saveData.prize = "";
      saveData.lastActionWasRemove = false;
      clearBigBallFace();
      document.getElementById("bigBingoLetter").textContent = "\u00a0";
      document.getElementById("bigBingoNumber").textContent = "\u00a0";
      save();
      if (loadedMasterBoard) {
        applyGameLayout();
        renderBingoStyle();
        ["B", "I", "N", "G", "O"].forEach((letter) => hideBingo(letter, "render"));
        updateBallStats();
      }
      applyAllPrefs();
      renderConfig();
    };
    if (saveData.drawnBingoBalls.length || saveData.winningPattern.length) {
      askConfirm("Trocar o tipo de bingo limpa as bolas desta partida.", "Trocar", apply);
    } else {
      apply();
    }
    return;
  }
  prefs()[key] = value;
  if (key === "sound" && value) ensureAudio();
  if (key === "voice" && value && window.speechSynthesis) window.speechSynthesis.getVoices();
  if (key === "counter") {
    saveData.ballsDrawnRemaining = value;
    toggleBallsDrawnRemaining("render");
  }
  save();
  applyAllPrefs();
  renderConfig();
}

function renderConfig() {
  setUpSettings();
  document.querySelectorAll("[data-choice]").forEach((button) => {
    button.classList.toggle("on", String(prefs()[button.dataset.choice]) === button.dataset.value);
  });
  document.querySelectorAll("[data-switch]").forEach((button) => {
    const on = !!prefs()[button.dataset.switch];
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = on ? "Ligado" : "Desligado";
  });
  const nameInput = document.getElementById("eventNameInput");
  if (document.activeElement !== nameInput) nameInput.value = prefs().eventName;
  const volume = document.getElementById("volumeInput");
  if (document.activeElement !== volume) volume.value = String(prefs().volume);
  const bg = document.getElementById("customBgInput");
  if (document.activeElement !== bg) bg.value = prefs().customBg;
  const ball = document.getElementById("customBallInput");
  if (document.activeElement !== ball) ball.value = prefs().customBall;
  document.getElementById("customColorFields").style.display = prefs().useCustomColors ? "block" : "none";
  document.getElementById("intervalRow").style.opacity = prefs().autoDraw ? "1" : "0.45";
  document.getElementById("volumeRow").style.opacity = (prefs().sound || prefs().voice) ? "1" : "0.45";
  renderShortcutList();
}

function renderShortcutList() {
  const root = document.getElementById("shortcutList");
  root.textContent = "";
  Object.keys(shortcutNames).forEach((action) => {
    if (is90() && action.indexOf("letter") === 0) return;
    const row = document.createElement("div");
    row.className = "shortcutRow" + (capturingShortcut === action ? " listening" : "");
    const label = document.createElement("span");
    label.textContent = shortcutNames[action];
    const keyButton = document.createElement("button");
    keyButton.type = "button";
    keyButton.className = "keycap";
    keyButton.dataset.action = "shortcut-edit";
    keyButton.dataset.shortcut = action;
    keyButton.textContent = capturingShortcut === action ? "Pressione uma tecla" : keyLabel(prefs().shortcuts[action]);
    row.appendChild(label);
    row.appendChild(keyButton);
    root.appendChild(row);
  });
}

function finishCapture(key) {
  if (key === "escape") {
    capturingShortcut = null;
    renderShortcutList();
    return;
  }
  const blocked = ["enter", "tab", "arrowleft", "arrowright", "arrowup", "arrowdown"];
  if (blocked.indexOf(key) !== -1) return;
  const map = prefs().shortcuts;
  const current = capturingShortcut;
  const previous = map[current];
  let swapped = "";
  Object.keys(map).forEach((action) => {
    if (action !== current && map[action] === key) swapped = action;
  });
  map[current] = key;
  if (swapped) map[swapped] = previous;
  capturingShortcut = null;
  save();
  renderShortcutList();
  renderHelpShortcuts();
}

function navConfig(section) {
  configSection = section;
  const panes = {
    Partida: "configPartida",
    Sorteio: "configSorteio",
    "Aparência": "configAparencia",
    Atalhos: "configAtalhos"
  };
  configTabs.forEach((name, index) => {
    const on = name === section;
    document.getElementById(panes[name]).style.display = on ? "block" : "none";
    document.getElementById(panes[name] + "Header").classList.toggle("boldHelp", on);
    if (on) document.getElementById("configNavLine").style.marginLeft = (index * 180) + "px";
  });
}

function stepConfig(direction) {
  let index = configTabs.indexOf(configSection);
  if (index < 0) index = 0;
  index = Math.max(0, Math.min(configTabs.length - 1, index + direction));
  navConfig(configTabs[index]);
}

function openConfig(returnTo, section) {
  configReturn = returnTo;
  hide(returnTo);
  show("configSlide", "grid");
  navConfig(section || configSection);
}

function closeConfig() {
  hide("configSlide");
  if (configReturn === "masterBoardSlide") show("masterBoardSlide", "grid");
  else show("titleSlide");
}

let displayWindow = null;
let displayChannel = null;

try {
  displayChannel = new BroadcastChannel("bingo-display");
} catch (error) {
  displayChannel = null;
}

if (prefsNeedSave) save();

function displaySnapshot() {
  const settings = prefs();
  return {
    type: "bingo-display",
    drawn: saveData.drawnBingoBalls.slice(),
    theme: saveData.themeColor,
    bingoStyle: saveData.bingoStyle,
    hidden: saveData.hiddenBingoLetters.slice(),
    pattern: saveData.winningPattern.slice(),
    prize: saveData.prize || "",
    gameType: settings.gameType,
    eventName: settings.eventName,
    useCustomColors: !!settings.useCustomColors,
    customBg: settings.customBg,
    customBall: settings.customBall,
    animSpeed: settings.animSpeed
  };
}

function publishDisplay() {
  if (!saveData.prefs) return;
  const snapshot = displaySnapshot();
  try {
    localStorage.setItem("bingoDisplayLive", JSON.stringify(snapshot));
  } catch (error) {
    /* a tela de exibição ainda recebe o estado pela janela aberta */
  }
  if (displayChannel) {
    try { displayChannel.postMessage(snapshot); } catch (error) { /* canal indisponível */ }
  }
  if (displayWindow && !displayWindow.closed) {
    displayWindow.postMessage(snapshot, "*");
  }
}

function openDisplay() {
  const page = new URL("display.html", window.location.href);
  if (displayWindow && !displayWindow.closed) {
    displayWindow.focus();
    publishDisplay();
    return;
  }
  displayWindow = window.open(page.href, "bingoDisplay", "width=1366,height=768");
  if (!displayWindow) {
    askConfirm("O navegador bloqueou a janela de exibição. Permita pop-ups deste tabuleiro e tente de novo.", "Entendi", function () {});
    return;
  }
  publishDisplay();
}

window.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "bingo-display-ready") return;
  if (!event.source || event.source === window) return;
  displayWindow = event.source;
  publishDisplay();
});

function openHistory() {
  hide("masterBoardSlide");
  show("historySlide", "grid");
}

function renderHelpShortcuts() {
  const root = document.getElementById("helpShortcutBody");
  if (!root) return;
  root.textContent = "";
  const title = document.createElement("p");
  title.style.fontSize = "27px";
  const strong = document.createElement("strong");
  strong.textContent = "Use os atalhos do teclado.";
  title.appendChild(strong);
  root.appendChild(title);
  const lead = document.createElement("p");
  lead.className = "smallMargin";
  lead.style.fontSize = "24px";
  lead.textContent = "Sorteie com " + keyLabel(prefs().shortcuts.draw) + ". Limpe com " + keyLabel(prefs().shortcuts.reset) + ".";
  root.appendChild(lead);
  const grid = document.createElement("div");
  grid.className = "helpShortcutGrid";
  [["fullscreen", "themes", "pattern", "config", "projection", "auto"], ["stats", "undo", "history", "home", "display"]].forEach((list) => {
    const column = document.createElement("div");
    list.forEach((action) => {
      const line = document.createElement("p");
      const keyName = document.createElement("strong");
      keyName.textContent = keyLabel(prefs().shortcuts[action]);
      line.appendChild(keyName);
      line.appendChild(document.createTextNode(" — " + shortcutNames[action]));
      column.appendChild(line);
    });
    grid.appendChild(column);
  });
  root.appendChild(grid);
  const note = document.createElement("p");
  note.style.fontSize = "20px";
  note.appendChild(document.createTextNode("As teclas podem ser trocadas em Configurações."));
  note.appendChild(document.createElement("br"));
  note.appendChild(document.createTextNode("Para abrir direto no tabuleiro, use essa opção ou "));
  const address = document.createElement("span");
  address.style.whiteSpace = "nowrap";
  address.textContent = "?masterboard";
  note.appendChild(address);
  note.appendChild(document.createTextNode(" no endereço."));
  note.appendChild(document.createElement("br"));
  note.appendChild(document.createTextNode("B, I, N, G e O ocultam a coluna. No bingo de 90 bolas, essas teclas não são usadas."));
  root.appendChild(note);
}

function previewCustomColor(key, value) {
  prefs()[key] = value;
  prefs().useCustomColors = true;
  const area = document.getElementById("area");
  area.classList.add("use-custom-ball");
  area.style.setProperty("--custom-ball", prefs().customBall);
  saveSoon();
}

function bindPreferenceInputs() {
  const eventNameInput = document.getElementById("eventNameInput");
  eventNameInput.addEventListener("input", (event) => {
    prefs().eventName = event.target.value;
    const banner = document.getElementById("eventName");
    const trimmed = event.target.value.trim();
    banner.textContent = trimmed;
    banner.style.display = trimmed ? "block" : "none";
    document.getElementById("masterBoardSlide").classList.toggle("has-event", !!trimmed);
    saveSoon();
  });
  eventNameInput.addEventListener("change", save);
  const volumeInput = document.getElementById("volumeInput");
  volumeInput.addEventListener("input", (event) => {
    prefs().volume = Number(event.target.value);
    saveSoon();
  });
  volumeInput.addEventListener("change", save);
  const customBgInput = document.getElementById("customBgInput");
  customBgInput.addEventListener("input", (event) => previewCustomColor("customBg", event.target.value));
  customBgInput.addEventListener("change", () => {
    save();
    applyAllPrefs();
    renderConfig();
  });
  const customBallInput = document.getElementById("customBallInput");
  customBallInput.addEventListener("input", (event) => previewCustomColor("customBall", event.target.value));
  customBallInput.addEventListener("change", () => {
    save();
    applyAllPrefs();
    renderConfig();
  });
}

window.addEventListener("pagehide", () => {
  if (saveTimer) save();
});

function keyboardNavHowToUse(leftOrRight) {
  let currentSpot;
  if (document.getElementById("howToUseBasics").style.display === "flex") {
    currentSpot = "Básico";
  } else if (document.getElementById("howToUseBasics2").style.display === "flex") {
    currentSpot = "Básico 2";
  } else {
    currentSpot = "Atalhos";
  }
  if (currentSpot === "Básico") {
    if (leftOrRight === 1) {
      navHelp("Básico 2");
    }
  } else if (currentSpot === "Básico 2") {
    if (leftOrRight === 0) {
      navHelp("Básico");
    } else {
      navHelp("Atalhos");
    }
  } else if (currentSpot === "Atalhos") {
    if (leftOrRight === 0) {
      navHelp("Básico 2");
    }
  }
}

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
}
