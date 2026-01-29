const TOTAL = 1000;
const PER_PAGE = 16;
const STORAGE_KEY = "caderneta_v1";

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

/* ===== Estado ===== */

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

/* ===== Hash (repetidos por bytes) ===== */

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

/* ===== Util ===== */

function findNextEmptyIndex() {
  return state.findIndex(c => !c);
}

/* ===== Render ===== */

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
      slot.onclick = () => openViewer(i);
    }

    page.appendChild(slot);
  }

  album.appendChild(page);

  const totalPages = Math.ceil(TOTAL / PER_PAGE);
  pageInfo.textContent = `Página ${currentPage + 1} / ${totalPages}`;

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === totalPages - 1;
}

/* ===== Upload individual (clicar no quadrado) ===== */

fileInput.onchange = async () => {
  try {
    const file = fileInput.files[0];
    if (!file || pendingIndex === null) return;

    const hash = await hashFile(file);
    if (hashExists(hash)) {
      // repetido: ignora sem erro
      pendingIndex = null;
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      state[pendingIndex] = { dataUrl: reader.result, hash };
      saveState();
      render();
      pendingIndex = null;
    };
    reader.readAsDataURL(file);
  } finally {
    fileInput.value = "";
  }
};

/* ===== Importar pasta (preencher próximos espaços livres) ===== */

importFolderBtn.onclick = () => folderInput.click();

folderInput.onchange = async () => {
  try {
    const files = Array.from(folderInput.files);
    let slotIndex = findNextEmptyIndex();

    for (const file of files) {
      if (slotIndex === -1) break;                 // álbum cheio
      if (!file.type.startsWith("image/")) continue;

      let hash;
      try {
        hash = await hashFile(file);
      } catch {
        continue; // sem erros
      }

      if (hashExists(hash)) continue;              // repetido: ignora

      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file);
      });

      if (!dataUrl) continue;

      state[slotIndex] = { dataUrl, hash };
      slotIndex = findNextEmptyIndex();
    }

    saveState();
    render();
  } finally {
    folderInput.value = "";
  }
};

/* ===== Paginação (efeito de mudar página) ===== */

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

/* ===== Viewer (abrir/fechar + swipe + setas) ===== */

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

/* Swipe (touch) */
let startX = null;
viewerImg.addEventListener("touchstart", (e) => {
  startX = e.touches[0].clientX;
}, { passive: true });

viewerImg.addEventListener("touchend", (e) => {
  if (startX === null) return;
  const dx = e.changedTouches[0].clientX - startX;
  if (dx > 50) prevSticker();
  else if (dx < -50) nextSticker();
  startX = null;
}, { passive: true });

/* Teclado */
document.addEventListener("keydown", (e) => {
  if (viewer.classList.contains("hidden")) return;
  if (e.key === "ArrowLeft") prevSticker();
  if (e.key === "ArrowRight") nextSticker();
  if (e.key === "Escape") closeViewer();
});

/* ===== Reset ===== */

resetBtn.onclick = () => {
  if (!confirm("Reiniciar a caderneta?")) return;
  // limpar tudo
  localStorage.removeItem(STORAGE_KEY);
  // garantir libertação total
  state = [];
  pendingIndex = null;
  viewerIndex = null;
  // reload forçado (liberta quota)
  location.reload();
};


/* ===== Init ===== */

render();


