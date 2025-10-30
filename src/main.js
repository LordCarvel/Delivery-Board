const motoboyContainer = document.getElementById('motoboyContainer');
const addMotoboyBtn = document.getElementById('addMotoboyBtn');
const searchInput = document.getElementById('searchInput');

const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const workspaceInput = document.getElementById('workspaceInput');
const setWorkspaceBtn = document.getElementById('setWorkspaceBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const syncStatusEl = document.getElementById('syncStatus');

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalForm = document.getElementById('modalForm');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');

const tplCard = document.getElementById('tpl-motoboy-card');
const tplLevaDivider = document.getElementById('tpl-leva-divider');
const tplPedido = document.getElementById('tpl-pedido');
const tplAddMotoboyFields = document.getElementById('tpl-add-motoboy-fields');
const tplAddLevaFields = document.getElementById('tpl-add-leva-fields');
const tplEditPedidoFields = document.getElementById('tpl-edit-pedido-fields');

let motoboys = [];
let currentMotoboyIndex = null;
let currentLevaIndex = null;
let currentPedidoIndex = null;
let currentAction = null;

let activeFilter = null;
let suppressBroadcast = false;
let currentTs = 0;

function getWorkspaceId() {
  const ws = new URLSearchParams(location.search).get('ws');
  const stored = localStorage.getItem('workspaceId');
  return ws || stored || 'default';
}

const WORKSPACE_ID = getWorkspaceId();
localStorage.setItem('workspaceId', WORKSPACE_ID);
if (workspaceInput) workspaceInput.value = WORKSPACE_ID;

function loadData() {
  const stored = localStorage.getItem('motoboys');
  if (!stored) {
    motoboys = [];
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    motoboys = Array.isArray(parsed) ? parsed : [];
  } catch {
    motoboys = [];
  }
}

function saveData() {
  localStorage.setItem('motoboys', JSON.stringify(motoboys));
}

function renderMotoboys() {
  motoboyContainer.innerHTML = '';

  if (!motoboys.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No motoboys registered yet.';
    empty.style.textAlign = 'center';
    empty.style.color = 'gray';
    motoboyContainer.appendChild(empty);
    saveData();
    return;
  }

  const filtered = !!activeFilter;

  const renderMotoboyCard = (m, motoboyIdx, onlyLevaIdx = null, highlightPedidoIdx = null) => {
    const card = tplCard.content.firstElementChild.cloneNode(true);
    const nameEl = card.querySelector('.motoboy-name');
    const bodyEl = card.querySelector('.motoboy-body');
    const addLevaBtnEl = card.querySelector('.add-leva-btn');
    const deleteMotoboyBtnEl = card.querySelector('.delete-motoboy-btn');

    nameEl.textContent = m.nome;

    addLevaBtnEl.addEventListener('click', () => {
      currentMotoboyIndex = motoboyIdx;
      const fields = tplAddLevaFields.content.cloneNode(true);
      openModal('Adicionar Leva', fields, 'addLeva');
    });

    deleteMotoboyBtnEl.addEventListener('click', () => {
      if (confirm('Excluir este motoboy e todas as suas levas/pedidos?')) {
        motoboys.splice(motoboyIdx, 1);
        if (activeFilter && activeFilter.motoboyIdx === motoboyIdx) {
          activeFilter = null;
          toggleClearFilters(false);
        }
        saveData();
        renderMotoboys();
        if (!suppressBroadcast && window.DBSync) {
          currentTs = Date.now();
          window.DBSync.broadcastUpdate(motoboys);
        }
      }
    });

    const levasToRender = onlyLevaIdx !== null ? [onlyLevaIdx] : m.levas.map((_, i) => i);
    levasToRender.forEach((levaIdx) => {
      const divider = tplLevaDivider.content.firstElementChild.cloneNode(true);
      const delLevaBtn = divider.querySelector('.delete-leva-btn');
      delLevaBtn.addEventListener('click', () => {
        if (confirm('Excluir esta leva?')) {
          motoboys[motoboyIdx].levas.splice(levaIdx, 1);
          if (activeFilter && activeFilter.motoboyIdx === motoboyIdx && activeFilter.levaIdx === levaIdx) {
            activeFilter = null;
            toggleClearFilters(false);
          }
          saveData();
          renderMotoboys();
          if (!suppressBroadcast && window.DBSync) {
            currentTs = Date.now();
            window.DBSync.broadcastUpdate(motoboys);
          }
        }
      });
      bodyEl.appendChild(divider);

      (m.levas[levaIdx] || []).forEach((pedido, pedidoIdx) => {
        const p = tplPedido.content.firstElementChild.cloneNode(true);
        p.textContent = `#${pedido}`;
        if (highlightPedidoIdx !== null && pedidoIdx === highlightPedidoIdx) {
          p.style.outline = '2px solid var(--color-blue)';
        }
        p.addEventListener('click', () => openEditPedidoModal(motoboyIdx, levaIdx, pedidoIdx));
        bodyEl.appendChild(p);
      });
    });

    motoboyContainer.appendChild(card);
  };

  if (filtered) {
    const f = activeFilter;
    const m = motoboys[f.motoboyIdx];
    if (m) renderMotoboyCard(m, f.motoboyIdx, f.levaIdx, f.pedidoIdx);
  } else {
    motoboys.forEach((m, mi) => renderMotoboyCard(m, mi));
  }

  saveData();

  if (filtered) {
    const highlighted = motoboyContainer.querySelector('.pedido[style*="outline"]');
    if (highlighted) highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function openModal(title, fieldsContent, action) {
  modalTitle.textContent = title;
  modalForm.innerHTML = '';
  if (typeof fieldsContent === 'string') {
    modalForm.innerHTML = fieldsContent;
  } else if (fieldsContent) {
    modalForm.appendChild(fieldsContent);
  }
  modalOverlay.classList.remove('hidden');
  currentAction = action;
  const firstInput = modalForm.querySelector('input, textarea, select');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalForm.innerHTML = '';
  currentAction = null;
}

cancelBtn.addEventListener('click', closeModal);

modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSave();
});
saveBtn.addEventListener('click', handleSave);

document.addEventListener('keydown', (e) => {
  if (modalOverlay.classList.contains('hidden')) return;
  if (e.key !== 'Enter') return;
  const ae = document.activeElement;
  const isTextarea = ae && ae.tagName === 'TEXTAREA';
  if (isTextarea && e.shiftKey) return;
  e.preventDefault();
  handleSave();
});

addMotoboyBtn.addEventListener('click', () => {
  const fields = tplAddMotoboyFields.content.cloneNode(true);
  openModal('Adicionar Motoboy', fields, 'addMotoboy');
});

function openEditPedidoModal(motoboyIdx, levaIdx, pedidoIdx) {
  currentMotoboyIndex = motoboyIdx;
  currentLevaIndex = levaIdx;
  currentPedidoIndex = pedidoIdx;
  const pedidoValue = motoboys[motoboyIdx].levas[levaIdx][pedidoIdx];

  const fields = tplEditPedidoFields.content.cloneNode(true);

  fields.querySelector('#pedidoNumber').value = pedidoValue;
  const select = fields.querySelector('#moveMotoboy');
  select.innerHTML = motoboys
    .map((m, i) => `<option value="${i}" ${i === motoboyIdx ? 'selected' : ''}>${m.nome}</option>`)
    .join('');

  openModal('Editar Pedido', fields, 'editPedido');
  document.getElementById('deletePedido').addEventListener('click', deletePedido);
}

function handleSave() {
  if (currentAction === 'addMotoboy') {
    const name = document.getElementById('motoboyName').value.trim();
    if (!name) return;
    motoboys.push({ nome: name, levas: [] });
  }

  if (currentAction === 'addLeva') {
    const pedidosInput = document.getElementById('pedidosInput').value;
    const pedidos = pedidosInput
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (!pedidos.length) return;
    motoboys[currentMotoboyIndex].levas.push(pedidos);
  }

  if (currentAction === 'editPedido') {
    const newNumber = document.getElementById('pedidoNumber').value.trim();
    const newMotoboyIdx = parseInt(document.getElementById('moveMotoboy').value, 10);
    if (!newNumber || Number.isNaN(newMotoboyIdx)) return;

    const oldMotoboy = motoboys[currentMotoboyIndex];
    oldMotoboy.levas[currentLevaIndex].splice(currentPedidoIndex, 1);

    if (!motoboys[newMotoboyIdx].levas.length) {
      motoboys[newMotoboyIdx].levas.push([]);
    }
    motoboys[newMotoboyIdx].levas[0].push(newNumber);
  }

  saveData();
  closeModal();
  activeFilter = null;
  toggleClearFilters(false);
  renderMotoboys();
  if (!suppressBroadcast && window.DBSync) {
    currentTs = Date.now();
    window.DBSync.broadcastUpdate(motoboys);
  }
}

function deletePedido() {
  const m = motoboys[currentMotoboyIndex];
  m.levas[currentLevaIndex].splice(currentPedidoIndex, 1);
  saveData();
  closeModal();
  activeFilter = null;
  toggleClearFilters(false);
  renderMotoboys();
  if (!suppressBroadcast && window.DBSync) {
    currentTs = Date.now();
    window.DBSync.broadcastUpdate(motoboys);
  }
}

function toggleClearFilters(show) {
  clearFiltersBtn.style.display = show ? 'inline-block' : 'none';
}

function applyFilterByPedido(query) {
  for (let mi = 0; mi < motoboys.length; mi++) {
    const m = motoboys[mi];
    for (let li = 0; li < m.levas.length; li++) {
      const leva = m.levas[li];
      for (let pi = 0; pi < leva.length; pi++) {
        if (String(leva[pi]).trim() === query) {
          activeFilter = { motoboyIdx: mi, levaIdx: li, pedidoIdx: pi };
          toggleClearFilters(true);
          renderMotoboys();
          return true;
        }
      }
    }
  }
  return false;
}

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = searchInput.value.trim();
    if (!q) return;
    applyFilterByPedido(q);
  }
});

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  if (!q && activeFilter) {
    activeFilter = null;
    toggleClearFilters(false);
    renderMotoboys();
  }
});

clearFiltersBtn.addEventListener('click', () => {
  activeFilter = null;
  searchInput.value = '';
  toggleClearFilters(false);
  renderMotoboys();
});

clearAllBtn.addEventListener('click', () => {
  if (!confirm('Apagar tudo e limpar o armazenamento?')) return;
  motoboys = [];
  activeFilter = null;
  toggleClearFilters(false);
  localStorage.clear();
  renderMotoboys();
  if (!suppressBroadcast && window.DBSync) {
    currentTs = Date.now();
    window.DBSync.broadcastUpdate(motoboys);
  }
  location.reload();
});

loadData();
renderMotoboys();

// Realtime sync init (PeerJS Cloud)
function getStateForSync(){ return { motoboys, ts: currentTs || 0 }; }
function applyRemoteState(remote){
  suppressBroadcast = true;
  motoboys = Array.isArray(remote) ? remote : [];
  saveData();
  renderMotoboys();
  suppressBroadcast = false;
}
if (typeof Peer !== 'undefined' && window.DBSync) {
  window.DBSync.init(WORKSPACE_ID, getStateForSync, applyRemoteState);
  if (syncStatusEl) {
    window.DBSync.onStatus((s) => { syncStatusEl.textContent = `sync: ${s}`; });
  }
}

// Workspace switch UI
if (setWorkspaceBtn) {
  setWorkspaceBtn.addEventListener('click', () => {
    const ws = (workspaceInput?.value || '').trim() || 'default';
    localStorage.setItem('workspaceId', ws);
    const sp = new URLSearchParams(location.search);
    sp.set('ws', ws);
    location.search = sp.toString();
  });
}

// Export/Import JSON
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(motoboys, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').split('.')[0];
    a.href = url;
    a.download = `deliveryboard-${WORKSPACE_ID}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

if (importBtn && importFile) {
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!Array.isArray(json)) throw new Error('Invalid file format');
      suppressBroadcast = true;
      motoboys = json;
      saveData();
      renderMotoboys();
      suppressBroadcast = false;
      if (window.DBSync) {
        currentTs = Date.now();
        window.DBSync.broadcastUpdate(motoboys);
      }
      alert('Import concluído!');
    } catch (err) {
      alert('Falha ao importar JSON.');
    } finally {
      e.target.value = '';
    }
  });
}
