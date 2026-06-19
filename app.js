const PDFJS_VERSION = '3.11.174';

const state = {
  file: null,
  arrayBuffer: null,
  pdfJsDoc: null,
  pageCount: 0,
  selectedPages: new Set(),
  viewMode: 'grid',
};

const el = {
  pdfInput: document.querySelector('#pdfInput'),
  fileInfo: document.querySelector('#fileInfo'),
  pagesContainer: document.querySelector('#pagesContainer'),
  selectionInfo: document.querySelector('#selectionInfo'),
  gridViewBtn: document.querySelector('#gridViewBtn'),
  listViewBtn: document.querySelector('#listViewBtn'),
  selectAllBtn: document.querySelector('#selectAllBtn'),
  clearSelectionBtn: document.querySelector('#clearSelectionBtn'),
  invertSelectionBtn: document.querySelector('#invertSelectionBtn'),
  downloadDeletedBtn: document.querySelector('#downloadDeletedBtn'),
  splitSizeInput: document.querySelector('#splitSizeInput'),
  splitDownloadBtn: document.querySelector('#splitDownloadBtn'),
  status: document.querySelector('#status'),
};

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

el.pdfInput.addEventListener('change', handleFileChange);
el.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
el.listViewBtn.addEventListener('click', () => setViewMode('list'));
el.selectAllBtn.addEventListener('click', selectAllPages);
el.clearSelectionBtn.addEventListener('click', clearSelection);
el.invertSelectionBtn.addEventListener('click', invertSelection);
el.downloadDeletedBtn.addEventListener('click', downloadPdfWithoutSelectedPages);
el.splitDownloadBtn.addEventListener('click', downloadSplitZip);

async function handleFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.type && file.type !== 'application/pdf') {
    showStatus('PDF 파일만 선택할 수 있습니다.', true);
    resetState();
    return;
  }

  resetState(false);
  state.file = file;
  setBusy(true, 'PDF를 읽는 중입니다...');

  try {
    state.arrayBuffer = await file.arrayBuffer();
    state.pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(state.arrayBuffer.slice(0)) }).promise;
    state.pageCount = state.pdfJsDoc.numPages;

    el.fileInfo.textContent = `${file.name} · 총 ${state.pageCount.toLocaleString()}페이지 · ${formatBytes(file.size)}`;
    el.splitSizeInput.max = String(state.pageCount);
    el.splitSizeInput.value = String(Math.min(10, state.pageCount));
    enableControls(true);
    updateSelectionInfo();
    await renderPageList();
    showStatus('PDF 불러오기가 완료되었습니다.');
  } catch (error) {
    console.error(error);
    showStatus('PDF를 불러오지 못했습니다. 암호화되었거나 손상된 파일일 수 있습니다.', true);
    resetState();
  } finally {
    setBusy(false);
  }
}

function resetState(clearInput = true) {
  state.file = null;
  state.arrayBuffer = null;
  state.pdfJsDoc = null;
  state.pageCount = 0;
  state.selectedPages.clear();
  el.pagesContainer.innerHTML = '';
  el.fileInfo.textContent = '아직 선택된 PDF가 없습니다.';
  el.selectionInfo.textContent = 'PDF를 불러오면 페이지가 여기에 표시됩니다.';
  enableControls(false);
  if (clearInput) el.pdfInput.value = '';
}

function enableControls(enabled) {
  const controls = [
    el.selectAllBtn,
    el.clearSelectionBtn,
    el.invertSelectionBtn,
    el.downloadDeletedBtn,
    el.splitSizeInput,
    el.splitDownloadBtn,
  ];
  controls.forEach((control) => {
    control.disabled = !enabled;
  });
}

async function renderPageList() {
  el.pagesContainer.innerHTML = '';

  for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
    const card = createPageCard(pageNumber);
    el.pagesContainer.appendChild(card);
  }

  for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
    await renderThumbnail(pageNumber);
    if (pageNumber % 4 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
}

function createPageCard(pageNumber) {
  const card = document.createElement('article');
  card.className = 'page-card';
  card.dataset.page = String(pageNumber);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'page-card__canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.id = `pageCanvas-${pageNumber}`;
  canvas.setAttribute('aria-label', `${pageNumber}페이지 미리보기`);
  canvasWrap.appendChild(canvas);

  const footer = document.createElement('div');
  footer.className = 'page-card__footer';

  const pageLabel = document.createElement('strong');
  pageLabel.textContent = `${pageNumber}페이지`;

  const checkLabel = document.createElement('label');
  checkLabel.className = 'delete-check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.page = String(pageNumber);
  checkbox.addEventListener('change', handlePageSelection);
  checkLabel.append(checkbox, '삭제');

  footer.append(pageLabel, checkLabel);
  card.append(canvasWrap, footer);
  return card;
}

async function renderThumbnail(pageNumber) {
  const page = await state.pdfJsDoc.getPage(pageNumber);
  const canvas = document.querySelector(`#pageCanvas-${pageNumber}`);
  if (!canvas) return;

  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = state.viewMode === 'list' ? 130 : 150;
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d', { alpha: false });
  const outputScale = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;
}

function handlePageSelection(event) {
  const pageNumber = Number(event.target.dataset.page);
  if (event.target.checked) {
    state.selectedPages.add(pageNumber);
  } else {
    state.selectedPages.delete(pageNumber);
  }
  syncCardSelection(pageNumber);
  updateSelectionInfo();
}

function syncCardSelection(pageNumber) {
  const card = document.querySelector(`.page-card[data-page="${pageNumber}"]`);
  if (card) card.classList.toggle('selected', state.selectedPages.has(pageNumber));
}

function selectAllPages() {
  for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
    state.selectedPages.add(pageNumber);
  }
  syncAllCheckboxes();
}

function clearSelection() {
  state.selectedPages.clear();
  syncAllCheckboxes();
}

function invertSelection() {
  const nextSelection = new Set();
  for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
    if (!state.selectedPages.has(pageNumber)) nextSelection.add(pageNumber);
  }
  state.selectedPages = nextSelection;
  syncAllCheckboxes();
}

function syncAllCheckboxes() {
  document.querySelectorAll('.delete-check input').forEach((checkbox) => {
    const pageNumber = Number(checkbox.dataset.page);
    checkbox.checked = state.selectedPages.has(pageNumber);
    syncCardSelection(pageNumber);
  });
  updateSelectionInfo();
}

function updateSelectionInfo() {
  if (!state.pageCount) {
    el.selectionInfo.textContent = 'PDF를 불러오면 페이지가 여기에 표시됩니다.';
    return;
  }

  const selectedCount = state.selectedPages.size;
  const remainingCount = state.pageCount - selectedCount;
  el.selectionInfo.textContent = `총 ${state.pageCount.toLocaleString()}페이지 중 삭제 선택 ${selectedCount.toLocaleString()}페이지 · 남을 페이지 ${remainingCount.toLocaleString()}페이지`;
}

function setViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  el.pagesContainer.classList.toggle('list', mode === 'list');
  el.gridViewBtn.classList.toggle('active', mode === 'grid');
  el.listViewBtn.classList.toggle('active', mode === 'list');

  if (state.pdfJsDoc) {
    for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber += 1) {
      renderThumbnail(pageNumber);
    }
  }
}

async function downloadPdfWithoutSelectedPages() {
  if (!state.arrayBuffer || !state.pageCount) return;
  if (state.selectedPages.size === 0) {
    showStatus('삭제할 페이지를 먼저 선택하세요.', true);
    return;
  }
  if (state.selectedPages.size >= state.pageCount) {
    showStatus('모든 페이지를 삭제할 수는 없습니다. 최소 1페이지는 남겨야 합니다.', true);
    return;
  }

  setBusy(true, '선택한 페이지를 제외한 새 PDF를 만드는 중입니다...');
  try {
    const sourcePdf = await PDFLib.PDFDocument.load(state.arrayBuffer.slice(0));
    const outputPdf = await PDFLib.PDFDocument.create();
    const keepIndexes = [];

    for (let index = 0; index < state.pageCount; index += 1) {
      const pageNumber = index + 1;
      if (!state.selectedPages.has(pageNumber)) keepIndexes.push(index);
    }

    const copiedPages = await outputPdf.copyPages(sourcePdf, keepIndexes);
    copiedPages.forEach((page) => outputPdf.addPage(page));
    const pdfBytes = await outputPdf.save();
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${baseFileName()}_deleted-pages.pdf`);
    showStatus('새 PDF 다운로드가 시작되었습니다.');
  } catch (error) {
    console.error(error);
    showStatus('새 PDF를 만드는 중 오류가 발생했습니다.', true);
  } finally {
    setBusy(false);
  }
}

async function downloadSplitZip() {
  if (!state.arrayBuffer || !state.pageCount) return;
  const splitSize = Number.parseInt(el.splitSizeInput.value, 10);

  if (!Number.isInteger(splitSize) || splitSize < 1) {
    showStatus('분할할 페이지 개수는 1 이상의 정수여야 합니다.', true);
    return;
  }
  if (splitSize > state.pageCount) {
    showStatus(`분할할 페이지 개수는 전체 페이지 수(${state.pageCount})보다 클 수 없습니다.`, true);
    return;
  }

  setBusy(true, 'PDF를 분할하고 ZIP으로 압축하는 중입니다...');
  try {
    const sourcePdf = await PDFLib.PDFDocument.load(state.arrayBuffer.slice(0));
    const zip = new JSZip();
    const totalChunks = Math.ceil(state.pageCount / splitSize);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const startIndex = chunkIndex * splitSize;
      const endIndexExclusive = Math.min(startIndex + splitSize, state.pageCount);
      const pageIndexes = range(startIndex, endIndexExclusive);
      const outputPdf = await PDFLib.PDFDocument.create();
      const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);
      copiedPages.forEach((page) => outputPdf.addPage(page));
      const pdfBytes = await outputPdf.save();
      const startPage = startIndex + 1;
      const endPage = endIndexExclusive;
      zip.file(`${baseFileName()}_p${pad(startPage)}-${pad(endPage)}.pdf`, pdfBytes);
      showStatus(`분할 PDF 생성 중... ${chunkIndex + 1}/${totalChunks}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (metadata) => showStatus(`ZIP 압축 중... ${metadata.percent.toFixed(0)}%`),
    );
    downloadBlob(zipBlob, `${baseFileName()}_split-${splitSize}-pages.zip`);
    showStatus('분할 ZIP 다운로드가 시작되었습니다.');
  } catch (error) {
    console.error(error);
    showStatus('분할 ZIP을 만드는 중 오류가 발생했습니다.', true);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy, message = '') {
  enableControls(!isBusy && Boolean(state.pageCount));
  el.pdfInput.disabled = isBusy;
  if (message) showStatus(message);
}

function showStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle('error', isError);
  el.status.classList.add('show');

  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => {
    el.status.classList.remove('show');
  }, isError ? 5200 : 3000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function range(startInclusive, endExclusive) {
  return Array.from({ length: endExclusive - startInclusive }, (_, index) => startInclusive + index);
}

function baseFileName() {
  const name = state.file?.name || 'document.pdf';
  return name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '_');
}

function pad(number) {
  return String(number).padStart(String(state.pageCount).length, '0');
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
