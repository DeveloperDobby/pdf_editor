const PDFJS_VERSION = '3.11.174';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const state = {
  file: null,
  fileKind: null,
  arrayBuffer: null,
  pdfJsDoc: null,
  pptxModel: null,
  originalItemCount: 0,
  items: [],
  selectedItems: new Set(),
  viewMode: 'grid',
};

const el = {
  fileInput: document.querySelector('#fileInput'),
  fileDropIcon: document.querySelector('#fileDropIcon'),
  fileInfo: document.querySelector('#fileInfo'),
  pagesTitle: document.querySelector('#pages-title'),
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

el.fileInput.addEventListener('change', handleFileChange);
el.gridViewBtn.addEventListener('click', () => setViewMode('grid'));
el.listViewBtn.addEventListener('click', () => setViewMode('list'));
el.selectAllBtn.addEventListener('click', selectAllItems);
el.clearSelectionBtn.addEventListener('click', clearSelection);
el.invertSelectionBtn.addEventListener('click', invertSelection);
el.downloadDeletedBtn.addEventListener('click', downloadEditedFile);
el.splitDownloadBtn.addEventListener('click', downloadSplitZip);

async function handleFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const fileKind = detectFileKind(file);
  if (fileKind === 'ppt') {
    showStatus('구형 .ppt 파일은 브라우저 단독 편집을 지원하지 않습니다. PowerPoint에서 .pptx로 저장한 뒤 다시 선택하세요.', true);
    resetState();
    return;
  }
  if (!fileKind) {
    showStatus('PDF 또는 PPTX 파일만 선택할 수 있습니다.', true);
    resetState();
    return;
  }

  resetState(false);
  state.file = file;
  state.fileKind = fileKind;
  setFileIcon(fileKind);
  setBusy(true, `${kindLabel()}를 읽는 중입니다...`);

  try {
    state.arrayBuffer = await file.arrayBuffer();

    if (fileKind === 'pdf') {
      await loadPdf(file);
    } else {
      await loadPptx(file);
    }

    enableControls(true);
    updateAfterItemsChanged();
    await renderPageList();
    showStatus(`${kindLabel()} 불러오기가 완료되었습니다.`);
  } catch (error) {
    console.error(error);
    showStatus(`${kindLabel()}를 불러오지 못했습니다. 암호화되었거나 손상된 파일일 수 있습니다.`, true);
    resetState();
  } finally {
    setBusy(false);
  }
}

async function loadPdf(file) {
  state.pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(state.arrayBuffer.slice(0)) }).promise;
  const pageCount = state.pdfJsDoc.numPages;
  state.originalItemCount = pageCount;
  state.items = Array.from({ length: pageCount }, (_, index) => ({
    originalIndex: index + 1,
    label: `${index + 1}페이지`,
    subLabel: 'PDF 페이지',
  }));

  el.pagesTitle.textContent = '3. 페이지 목록';
  el.fileInfo.textContent = `${file.name} · 총 ${pageCount.toLocaleString()}페이지 · ${formatBytes(file.size)}`;
}

async function loadPptx(file) {
  const zip = await JSZip.loadAsync(state.arrayBuffer.slice(0));
  const model = await readPptxModel(zip);

  if (!model.slides.length) {
    throw new Error('PPTX 안에서 슬라이드를 찾지 못했습니다.');
  }

  state.pptxModel = model;
  state.originalItemCount = model.slides.length;
  state.items = model.slides.map((slide, index) => ({
    ...slide,
    originalIndex: index + 1,
    label: `${index + 1}슬라이드`,
    subLabel: 'PPTX 슬라이드',
  }));

  el.pagesTitle.textContent = '3. 슬라이드 목록';
  el.fileInfo.textContent = `${file.name} · 총 ${model.slides.length.toLocaleString()}슬라이드 · ${formatBytes(file.size)}`;
}

function resetState(clearInput = true) {
  state.file = null;
  state.fileKind = null;
  state.arrayBuffer = null;
  state.pdfJsDoc = null;
  state.pptxModel = null;
  state.originalItemCount = 0;
  state.items = [];
  state.selectedItems.clear();
  el.pagesContainer.innerHTML = '';
  el.fileInfo.textContent = '아직 선택된 파일이 없습니다.';
  el.selectionInfo.textContent = '파일을 불러오면 페이지 또는 슬라이드가 여기에 표시됩니다.';
  el.pagesTitle.textContent = '3. 페이지 목록';
  setFileIcon(null);
  enableControls(false);
  if (clearInput) el.fileInput.value = '';
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

  state.items.forEach((item, visibleIndex) => {
    const card = createItemCard(item, visibleIndex + 1);
    el.pagesContainer.appendChild(card);
  });

  if (state.fileKind !== 'pdf') return;

  for (let visibleIndex = 0; visibleIndex < state.items.length; visibleIndex += 1) {
    await renderThumbnail(state.items[visibleIndex]);
    if ((visibleIndex + 1) % 4 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
}

function createItemCard(item, visibleNumber) {
  const card = document.createElement('article');
  card.className = `page-card ${state.fileKind === 'pptx' ? 'page-card--pptx' : ''}`;
  card.dataset.itemId = String(item.originalIndex);

  if (state.fileKind === 'pdf') {
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'page-card__canvas-wrap';

    const canvas = document.createElement('canvas');
    canvas.id = `pageCanvas-${item.originalIndex}`;
    canvas.setAttribute('aria-label', `${item.label} 미리보기`);
    canvasWrap.appendChild(canvas);
    card.appendChild(canvasWrap);
  } else {
    card.appendChild(createPptxPreview(item));
  }

  const footer = document.createElement('div');
  footer.className = 'page-card__footer';

  const meta = document.createElement('div');
  meta.className = 'page-card__meta';

  const itemLabel = document.createElement('strong');
  itemLabel.textContent = item.label;

  const itemSubLabel = document.createElement('small');
  itemSubLabel.textContent = `현재 순서 ${visibleNumber.toLocaleString()} · ${item.subLabel}`;
  meta.append(itemLabel, itemSubLabel);

  const actions = document.createElement('div');
  actions.className = 'page-card__actions';

  const checkLabel = document.createElement('label');
  checkLabel.className = 'delete-check';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.dataset.itemId = String(item.originalIndex);
  checkbox.checked = state.selectedItems.has(item.originalIndex);
  checkbox.addEventListener('change', handleItemSelection);
  checkLabel.append(checkbox, '삭제');

  const trashButton = document.createElement('button');
  trashButton.className = 'trash-button';
  trashButton.type = 'button';
  trashButton.dataset.itemId = String(item.originalIndex);
  trashButton.setAttribute('aria-label', `${item.label} 바로 삭제`);
  trashButton.title = '바로 삭제';
  trashButton.textContent = '🗑';
  trashButton.addEventListener('click', handleInstantDelete);

  actions.append(checkLabel, trashButton);
  footer.append(meta, actions);
  card.appendChild(footer);
  syncCardSelection(item.originalIndex, card);
  return card;
}

function createPptxPreview(item) {
  const previewWrap = document.createElement('div');
  previewWrap.className = 'page-card__preview';

  const preview = document.createElement('div');
  preview.className = 'slide-preview';

  const badge = document.createElement('span');
  badge.className = 'slide-preview__badge';
  badge.textContent = 'PPTX';

  const text = document.createElement('div');
  text.className = 'slide-preview__text';
  text.textContent = item.text || '이 슬라이드에서 추출 가능한 텍스트가 없습니다.';

  preview.append(badge, text);
  previewWrap.appendChild(preview);
  return previewWrap;
}

async function renderThumbnail(item) {
  const page = await state.pdfJsDoc.getPage(item.originalIndex);
  const canvas = document.querySelector(`#pageCanvas-${item.originalIndex}`);
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

function handleItemSelection(event) {
  const itemId = Number(event.target.dataset.itemId);
  if (event.target.checked) {
    state.selectedItems.add(itemId);
  } else {
    state.selectedItems.delete(itemId);
  }
  syncCardSelection(itemId);
  updateSelectionInfo();
}

function handleInstantDelete(event) {
  const itemId = Number(event.currentTarget.dataset.itemId);
  const item = state.items.find((candidate) => candidate.originalIndex === itemId);
  if (!item) return;

  if (state.items.length <= 1) {
    showStatus(`마지막 ${unitName()}은 삭제할 수 없습니다. 최소 1개는 남겨야 합니다.`, true);
    return;
  }

  state.items = state.items.filter((candidate) => candidate.originalIndex !== itemId);
  state.selectedItems.delete(itemId);
  renderPageList();
  updateAfterItemsChanged();
  showStatus(`${item.label}을 목록에서 삭제했습니다. 다운로드하면 이 상태가 반영됩니다.`);
}

function syncCardSelection(itemId, givenCard = null) {
  const card = givenCard || document.querySelector(`.page-card[data-item-id="${itemId}"]`);
  if (card) card.classList.toggle('selected', state.selectedItems.has(itemId));
}

function selectAllItems() {
  state.items.forEach((item) => state.selectedItems.add(item.originalIndex));
  syncAllCheckboxes();
}

function clearSelection() {
  state.selectedItems.clear();
  syncAllCheckboxes();
}

function invertSelection() {
  const currentItemIds = new Set(state.items.map((item) => item.originalIndex));
  const nextSelection = new Set();

  currentItemIds.forEach((itemId) => {
    if (!state.selectedItems.has(itemId)) nextSelection.add(itemId);
  });

  state.selectedItems = nextSelection;
  syncAllCheckboxes();
}

function syncAllCheckboxes() {
  document.querySelectorAll('.delete-check input').forEach((checkbox) => {
    const itemId = Number(checkbox.dataset.itemId);
    checkbox.checked = state.selectedItems.has(itemId);
    syncCardSelection(itemId);
  });
  updateSelectionInfo();
}

function updateAfterItemsChanged() {
  const currentCount = state.items.length;
  el.splitSizeInput.max = String(Math.max(1, currentCount));
  el.splitSizeInput.value = String(Math.min(Number.parseInt(el.splitSizeInput.value, 10) || 10, Math.max(1, currentCount)));
  enableControls(Boolean(currentCount));
  updateSelectionInfo();
}

function updateSelectionInfo() {
  if (!state.items.length) {
    el.selectionInfo.textContent = '파일을 불러오면 페이지 또는 슬라이드가 여기에 표시됩니다.';
    return;
  }

  const selectedCount = state.selectedItems.size;
  const remainingCount = state.items.length - selectedCount;
  const unit = unitName();
  el.selectionInfo.textContent = `현재 ${state.items.length.toLocaleString()}${unit} 중 삭제 선택 ${selectedCount.toLocaleString()}${unit} · 남을 ${unit} ${remainingCount.toLocaleString()}개`;
}

function setViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  el.pagesContainer.classList.toggle('list', mode === 'list');
  el.gridViewBtn.classList.toggle('active', mode === 'grid');
  el.listViewBtn.classList.toggle('active', mode === 'list');

  if (state.fileKind === 'pdf' && state.pdfJsDoc) {
    state.items.forEach((item) => renderThumbnail(item));
  }
}

async function downloadEditedFile() {
  if (!state.arrayBuffer || !state.items.length) return;

  const keepItems = state.items.filter((item) => !state.selectedItems.has(item.originalIndex));
  const hasInstantDeletion = state.originalItemCount > state.items.length;
  if (state.selectedItems.size === 0 && !hasInstantDeletion) {
    showStatus(`삭제할 ${unitName()}을 먼저 선택하거나 각 항목의 휴지통 버튼으로 바로 삭제하세요.`, true);
    return;
  }
  if (keepItems.length === 0) {
    showStatus(`모든 ${unitName()}을 삭제할 수는 없습니다. 최소 1개는 남겨야 합니다.`, true);
    return;
  }

  setBusy(true, `선택한 ${unitName()}을 제외한 새 ${kindLabel()}를 만드는 중입니다...`);
  try {
    if (state.fileKind === 'pdf') {
      await downloadEditedPdf(keepItems);
    } else {
      await downloadEditedPptx(keepItems);
    }
    state.selectedItems.clear();
    syncAllCheckboxes();
    showStatus(`새 ${kindLabel()} 다운로드가 시작되었습니다.`);
  } catch (error) {
    console.error(error);
    showStatus(`새 ${kindLabel()}를 만드는 중 오류가 발생했습니다.`, true);
  } finally {
    setBusy(false);
  }
}

async function downloadEditedPdf(keepItems) {
  const sourcePdf = await PDFLib.PDFDocument.load(state.arrayBuffer.slice(0));
  const outputPdf = await PDFLib.PDFDocument.create();
  const keepIndexes = keepItems.map((item) => item.originalIndex - 1);
  const copiedPages = await outputPdf.copyPages(sourcePdf, keepIndexes);
  copiedPages.forEach((page) => outputPdf.addPage(page));
  const pdfBytes = await outputPdf.save();
  downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${baseFileName()}_edited.pdf`);
}

async function downloadEditedPptx(keepItems) {
  const keepOriginalIndexes = keepItems.map((item) => item.originalIndex);
  const pptxBlob = await buildPptxBlob(keepOriginalIndexes);
  downloadBlob(pptxBlob, `${baseFileName()}_edited.pptx`);
}

async function downloadSplitZip() {
  if (!state.arrayBuffer || !state.items.length) return;
  const splitSize = Number.parseInt(el.splitSizeInput.value, 10);

  if (!Number.isInteger(splitSize) || splitSize < 1) {
    showStatus(`분할할 ${unitName()} 개수는 1 이상의 정수여야 합니다.`, true);
    return;
  }
  if (splitSize > state.items.length) {
    showStatus(`분할할 ${unitName()} 개수는 현재 ${unitName()} 수(${state.items.length})보다 클 수 없습니다.`, true);
    return;
  }

  setBusy(true, `${kindLabel()}를 분할하고 ZIP으로 압축하는 중입니다...`);
  try {
    if (state.fileKind === 'pdf') {
      await downloadSplitPdfZip(splitSize);
    } else {
      await downloadSplitPptxZip(splitSize);
    }
    showStatus('분할 ZIP 다운로드가 시작되었습니다.');
  } catch (error) {
    console.error(error);
    showStatus('분할 ZIP을 만드는 중 오류가 발생했습니다.', true);
  } finally {
    setBusy(false);
  }
}

async function downloadSplitPdfZip(splitSize) {
  const sourcePdf = await PDFLib.PDFDocument.load(state.arrayBuffer.slice(0));
  const zip = new JSZip();
  const totalChunks = Math.ceil(state.items.length / splitSize);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const chunkItems = state.items.slice(chunkIndex * splitSize, Math.min((chunkIndex + 1) * splitSize, state.items.length));
    const pageIndexes = chunkItems.map((item) => item.originalIndex - 1);
    const outputPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndexes);
    copiedPages.forEach((page) => outputPdf.addPage(page));
    const pdfBytes = await outputPdf.save();
    const startPage = chunkIndex * splitSize + 1;
    const endPage = startPage + chunkItems.length - 1;
    zip.file(`${baseFileName()}_p${pad(startPage)}-${pad(endPage)}.pdf`, pdfBytes);
    showStatus(`분할 PDF 생성 중... ${chunkIndex + 1}/${totalChunks}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const zipBlob = await generateZipBlob(zip);
  downloadBlob(zipBlob, `${baseFileName()}_split-${splitSize}-${unitFileName()}.zip`);
}

async function downloadSplitPptxZip(splitSize) {
  const zip = new JSZip();
  const totalChunks = Math.ceil(state.items.length / splitSize);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const chunkItems = state.items.slice(chunkIndex * splitSize, Math.min((chunkIndex + 1) * splitSize, state.items.length));
    const keepOriginalIndexes = chunkItems.map((item) => item.originalIndex);
    const pptxBlob = await buildPptxBlob(keepOriginalIndexes);
    const startSlide = chunkIndex * splitSize + 1;
    const endSlide = startSlide + chunkItems.length - 1;
    zip.file(`${baseFileName()}_s${pad(startSlide)}-${pad(endSlide)}.pptx`, pptxBlob);
    showStatus(`분할 PPTX 생성 중... ${chunkIndex + 1}/${totalChunks}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const zipBlob = await generateZipBlob(zip);
  downloadBlob(zipBlob, `${baseFileName()}_split-${splitSize}-${unitFileName()}.zip`);
}

async function generateZipBlob(zip) {
  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => showStatus(`ZIP 압축 중... ${metadata.percent.toFixed(0)}%`),
  );
}

async function readPptxModel(zip) {
  const presentationPath = 'ppt/presentation.xml';
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const presentationXml = await readZipText(zip, presentationPath);
  const relsXml = await readZipText(zip, relsPath);
  const presentationDoc = parseXml(presentationXml);
  const relsDoc = parseXml(relsXml);
  const relMap = getRelationshipMap(relsDoc, presentationPath);
  const slideIdNodes = getElementsByLocalName(presentationDoc, 'sldId');

  const slides = [];
  for (const slideIdNode of slideIdNodes) {
    const relId = getRelationshipId(slideIdNode);
    const slidePath = relMap.get(relId);
    if (!slidePath) continue;

    const slideXml = await readZipText(zip, slidePath).catch(() => '');
    slides.push({
      relId,
      slidePath,
      text: extractSlideText(slideXml),
    });
  }

  return { slides };
}

async function buildPptxBlob(keepOriginalIndexes) {
  const keepSet = new Set(keepOriginalIndexes);
  const zip = await JSZip.loadAsync(state.arrayBuffer.slice(0));
  const presentationPath = 'ppt/presentation.xml';
  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const presentationXml = await readZipText(zip, presentationPath);
  const relsXml = await readZipText(zip, relsPath);
  const presentationDoc = parseXml(presentationXml);
  const relsDoc = parseXml(relsXml);
  const slideIdNodes = getElementsByLocalName(presentationDoc, 'sldId');
  const removedRelIds = new Set();

  slideIdNodes.forEach((node, index) => {
    const originalIndex = index + 1;
    if (!keepSet.has(originalIndex)) {
      const relId = getRelationshipId(node);
      if (relId) removedRelIds.add(relId);
      node.parentNode?.removeChild(node);
    }
  });

  getElementsByLocalName(relsDoc, 'Relationship').forEach((node) => {
    if (removedRelIds.has(node.getAttribute('Id'))) {
      node.parentNode?.removeChild(node);
    }
  });

  zip.file(presentationPath, serializeXml(presentationDoc));
  zip.file(relsPath, serializeXml(relsDoc));
  await updatePptxSlideCount(zip, keepSet.size);

  return zip.generateAsync({
    type: 'blob',
    mimeType: PPTX_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

async function updatePptxSlideCount(zip, slideCount) {
  const appPath = 'docProps/app.xml';
  const appFile = zip.file(appPath);
  if (!appFile) return;

  const appXml = await appFile.async('string');
  const appDoc = parseXml(appXml);
  const slidesNode = getElementsByLocalName(appDoc, 'Slides')[0];
  if (!slidesNode) return;

  slidesNode.textContent = String(slideCount);
  zip.file(appPath, serializeXml(appDoc));
}

async function readZipText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`${path} 파일을 찾지 못했습니다.`);
  return file.async('string');
}

function parseXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) throw new Error('XML 파싱에 실패했습니다.');
  return doc;
}

function serializeXml(doc) {
  return new XMLSerializer().serializeToString(doc);
}

function getRelationshipMap(relsDoc, basePath) {
  const relationships = getElementsByLocalName(relsDoc, 'Relationship');
  const relMap = new Map();

  relationships.forEach((relationship) => {
    const id = relationship.getAttribute('Id');
    const target = relationship.getAttribute('Target');
    if (!id || !target) return;
    relMap.set(id, resolveZipPath(basePath, target));
  });

  return relMap;
}

function getRelationshipId(node) {
  return node.getAttributeNS(REL_NS, 'id') || node.getAttribute('r:id');
}

function getElementsByLocalName(root, localName) {
  return Array.from(root.getElementsByTagName('*')).filter((node) => node.localName === localName);
}

function resolveZipPath(basePath, target) {
  if (target.startsWith('/')) return normalizeZipPath(target.slice(1));
  const baseDir = basePath.split('/').slice(0, -1).join('/');
  return normalizeZipPath(`${baseDir}/${target}`);
}

function normalizeZipPath(path) {
  const parts = [];
  path.split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') {
      parts.pop();
      return;
    }
    parts.push(part);
  });
  return parts.join('/');
}

function extractSlideText(slideXml) {
  if (!slideXml) return '';

  try {
    const slideDoc = parseXml(slideXml);
    const texts = getElementsByLocalName(slideDoc, 't')
      .map((node) => node.textContent.trim())
      .filter(Boolean);
    return compactText(texts.join(' '), 180);
  } catch (error) {
    console.warn(error);
    return '';
  }
}

function compactText(text, maxLength) {
  const compacted = text.replace(/\s+/g, ' ').trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength - 1)}…`;
}

function detectFileKind(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.pptx')) return 'pptx';
  if (name.endsWith('.ppt')) return 'ppt';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === PPTX_MIME) return 'pptx';
  return null;
}

function setFileIcon(fileKind) {
  if (fileKind === 'pptx') {
    el.fileDropIcon.textContent = 'PPTX';
    el.fileDropIcon.classList.add('pptx');
  } else {
    el.fileDropIcon.textContent = 'PDF';
    el.fileDropIcon.classList.remove('pptx');
  }
}

function setBusy(isBusy, message = '') {
  enableControls(!isBusy && Boolean(state.items.length));
  el.fileInput.disabled = isBusy;
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

function baseFileName() {
  const name = state.file?.name || 'document';
  return name.replace(/\.(pdf|pptx|ppt)$/i, '').replace(/[\\/:*?"<>|]+/g, '_');
}

function pad(number) {
  return String(number).padStart(String(Math.max(1, state.items.length)).length, '0');
}

function kindLabel() {
  if (state.fileKind === 'pptx') return 'PPTX';
  return 'PDF';
}

function unitName() {
  if (state.fileKind === 'pptx') return '슬라이드';
  return '페이지';
}

function unitFileName() {
  if (state.fileKind === 'pptx') return 'slides';
  return 'pages';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
