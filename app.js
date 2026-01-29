const DOUBLE_TAP_DELAY = 300; // ms
let lastTapTime = 0;
let lastTapIndex = null;

const TOTAL = 1000;
const PER_PAGE = 16;
const STORAGE_KEY = "caderneta_v1";

// Tamanho final do cromo (2:3)
const TARGET_W = 400;
const TARGET_H = 600;
const JPEG_QUALITY = 0.8;

const album = document.getElementById("album");
const fileInput = document.getElementById("fileInput");
const folderInput = document.getElementById("folderInput");

const pageInfo = document.getElementById("pageInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const resetBtn = document.getElementById("resetBtn");
const importFolderBtn = document.getElementById("importFolderBtn");

const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const viewerNum = document.getElementById("viewerNum");
const viewerClose = document.getElementById("viewerClose");

let state = loadState();
let currentPage = 0;
let pendingIndex = null;
let viewerIndex = null;

/* ================= Estado ================= */

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return Array(TOTAL).fill(null);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === TOTAL) return parsed;
  } catch {}
  return Array(TOTAL).fill(null);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ================= Hash (repetidos por bytes) ================= */

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  let hash = 0;
  for (const b of new Uint8Array(buffer)) {
    hash = ((hash << 5) - hash) + b;
    hash |= 0;
  }
  return String(hash);
}

function hashExists(hash) {
  return state.some(cell => cell && cell.hash === hash);
}

function nextEmptyIndex() {
  return state.findIndex(c => !c);
}

/* ================= Redimensionar (crop centro + resize 2:3) ================= */

function resizeImageToDataUrl(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      img.onload = () => {
        const srcRatio = img.width / img.height;
        const targetRatio = TARGET_W / TARGET_H;

        let sx, sy, sw, sh;

        if (srcRatio > targetRatio) {
          // mais largo -> cortar laterais
          sh = img.height;
          sw = sh * targetRatio;
          sx = (img.width - sw) / 2;
          sy = 0;
        } else {
          // mais alto -> cortar topo/fundo
          sw = img.width;
          sh = sw / targetRatio;
          sx = 0;
          sy = (img.height - sh) / 2;
        }

        const canvas = document.createElement("canvas");
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);

        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };

      img.onerror = () => resolve(null);
      img.src = reader.result;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/* ================= Render ================= */

function render() {
  album.innerHTML = "";

  const start = currentPage * PER_PAGE;
  const end = Math.min(start + PER_PAGE, TOTAL);

  const page = document.createElement("div");
  page.className = "page";

  for (let i = start; i < end; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = `#${String(i + 1).padStart(3, "0")}`;
    slot.appendChild(num);

    const cell = state[i];

    if (!cell) {
      slot.classList.add("empty");
      slot.onclick = () => {
        pendingIndex = i;
        fileInput.click();
      };
    } else {
      const img = document.createElement("img");
      img.src = cell.dataUrl;
      slot.appendChild(img);
      slot.onclick = (e) => {
  const now = Date.now();

  // double tap / double click
  if (lastTapIndex === i && now - lastTapTime < DOUBLE_TAP_DELAY) {
    // remover cromo
    state[i] = null;
    saveState();
    render();

    // reset tap state
    lastTapTime = 0;
    lastTapIndex = null;
    return;
  }

  // primeiro tap → abre viewer
  lastTapTime = now;
  lastTapIndex = i;

  // pequeno delay para permitir double tap
  setTimeout(() => {
    if (lastTapIndex === i) {
      openViewer(i);
      lastTapIndex = null;
    }
  }, DOUBLE_TAP_DELAY);
};

    }

    page.appendChild(slot);
  }

  album.appendChild(page);

  const totalPages = Math.ceil(TOTAL / PER_PAGE);
  pageInfo.textContent = `Página ${currentPage + 1} / ${totalPages}`;

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === totalPages - 1;
}

/* ================= Upload individual ================= */

fileInput.onchange = async () => {
  try {
    const file = fileInput.files[0];
    if (!file || pendingIndex === null) return;

    const hash = await hashFile(file);
    if (hashExists(hash)) {
      // repetido: ignora silenciosamente
      pendingIndex = null;
      return;
    }

    const dataUrl = await resizeImageToDataUrl(file);
    if (!dataUrl) {
      pendingIndex = null;
      return;
    }

    state[pendingIndex] = { dataUrl, hash };

    try { saveState(); }
    catch (e) {
      // se rebentar quota: não crasha, apenas recarrega para libertar e manter consistência
      alert("Sem espaço no browser. Usa 'Reiniciar álbum' ou reduz o tamanho das imagens.");
      return;
    }

    render();
    pendingIndex = null;
  } finally {
    fileInput.value = "";
  }
};

/* ================= Importar pasta ================= */

importFolderBtn.onclick = () => folderInput.click();

folderInput.onchange = async () => {
  try {
    const files = Array.from(folderInput.files);
    let idx = nextEmptyIndex();

    for (const file of files) {
      if (idx === -1) break; // álbum cheio
      if (!file.type.startsWith("image/")) continue;

      let hash;
      try { hash = await hashFile(file); }
      catch { continue; }

      if (hashExists(hash)) continue; // repetido: ignora

      const dataUrl = await resizeImageToDataUrl(file);
      if (!dataUrl) continue;

      state[idx] = { dataUrl, hash };
      idx = nextEmptyIndex();
    }

    try { saveState(); }
    catch (e) {
      alert("Sem espaço no browser. Usa 'Reiniciar álbum' ou reduz o tamanho das imagens.");
      return;
    }

    render();
  } finally {
    folderInput.value = "";
  }
};

/* ================= Paginação ================= */

function turnPage(next) {
  album.classList.add("turn");
  setTimeout(() => {
    currentPage += next ? 1 : -1;
    render();
    album.classList.remove("turn");
  }, 200);
}

prevBtn.onclick = () => currentPage > 0 && turnPage(false);
nextBtn.onclick = () => {
  const max = Math.ceil(TOTAL / PER_PAGE) - 1;
  currentPage < max && turnPage(true);
};

/* ================= Viewer + Navegação (swipe/drag/teclas) ================= */

function openViewer(index) {
  viewerIndex = index;
  updateViewer();
  viewer.classList.remove("hidden");
}

function closeViewer() {
  viewer.classList.add("hidden");
  viewerIndex = null;
  viewerImg.src = "";
  viewerNum.textContent = "";
}

function updateViewer() {
  const cell = state[viewerIndex];
  if (!cell) return;
  viewerImg.src = cell.dataUrl;
  viewerNum.textContent = `Cromo #${String(viewerIndex + 1).padStart(3, "0")}`;
}

function prevSticker() {
  if (viewerIndex === null) return;
  let i = viewerIndex - 1;
  while (i >= 0 && !state[i]) i--;
  if (i >= 0) {
    viewerIndex = i;
    updateViewer();
  }
}

function nextSticker() {
  if (viewerIndex === null) return;
  let i = viewerIndex + 1;
  while (i < TOTAL && !state[i]) i++;
  if (i < TOTAL) {
    viewerIndex = i;
    updateViewer();
  }
}

viewerClose.onclick = closeViewer;

viewer.addEventListener("click", (e) => {
  if (e.target.classList.contains("viewer-backdrop")) closeViewer();
});

/* Touch swipe */
let touchStartX = null;
viewerImg.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

viewerImg.addEventListener("touchend", (e) => {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (dx > 50) prevSticker();
  else if (dx < -50) nextSticker();
  touchStartX = null;
}, { passive: true });

/* Mouse drag swipe */
let dragStartX = null;
let dragging = false;

viewerImg.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStartX = e.clientX;
});

window.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  if (dx > 80) prevSticker();
  else if (dx < -80) nextSticker();
  dragging = false;
  dragStartX = null;
});

/* Teclado */
document.addEventListener("keydown", (e) => {
  if (viewer.classList.contains("hidden")) return;
  if (e.key === "ArrowLeft") prevSticker();
  if (e.key === "ArrowRight") nextSticker();
  if (e.key === "Escape") closeViewer();
});

/* ================= Reset ================= */

resetBtn.onclick = () => {
  if (!confirm("Reiniciar a caderneta?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload(); // liberta quota imediatamente
};

/* ================= Init ================= */

render();
