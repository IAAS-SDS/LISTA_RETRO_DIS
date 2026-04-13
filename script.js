const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbxAlqgoBhCfYakuk3OigiWN9cz9pvTSYSBprvsiSH5XHtNFCQDQNswpWUyg1YwTMq3M/exec",
  maxUploadSizeMb: 10,
  allowedUploadExtensions: [
    "SIR", "DBF", "COL", "ACP", "BIS", "CCC", "CVC", "CAF", "CSB", "FTI",
    "CPO", "CUC", "CAZ", "CFN", "NCC", "CRS", "CCR", "CLM", "CDM", "ADC",
    "CDO", "CIC", "SML", "JNC", "NOG", "CME", "PRO", "CLN", "NEL", "CLP",
    "CRH", "CPC", "CCO", "COC", "HUS", "HET", "HLV", "HOK", "SCL", "HSB",
    "TRA", "CLS", "FCI", "HLM", "FSC", "HCP", "HIJ", "HMS", "HMC", "HBU",
    "HSR", "FSB", "HUM", "HUN", "HSI", "ICB", "INC", "IIR", "IMC", "CMC",
    "MFI", "MEF", "HSJ", "HDB", "HDS", "HCH", "HDF", "JEG", "IMI", "HDT",
    "SAP", "HEN", "TUN", "UMO", "PSS"
  ],
  defaultSheetName: "BOG_FEB_2026",
  availableSheets: ["BOG_FEB_2026"],
  adminEmails: ["infeccionesasociadassaludiaas@gmail.com"],
  editDeadlines: {
    BOG_ENE_2026: "2026-02-15",
    BOG_FEB_2026: "2026-04-17",
    BOG_MAR_2026: "2026-04-15",
    BOG_ABR_2026: "2026-05-15",
    BOG_MAY_2026: "2026-06-15",
    BOG_JUN_2026: "2026-07-15",
    BOG_JUL_2026: "2026-08-15",
    BOG_AGO_2026: "2026-09-15",
    BOG_SEP_2026: "2026-10-15",
    BOG_OCT_2026: "2026-11-15",
    BOG_NOV_2026: "2026-12-15",
    BOG_DIC_2026: "2027-01-15"
  }
};

const state = {
  rows: [],
  filteredRows: [],
  currentSheetName: CONFIG.defaultSheetName,
  authorizedEmail: "",
  usingRemote: true,
  isUploadingSupport: false,
  isGeneratingPdf: false,
  laboratoryFilter: "",
  pendingUploadLaboratory: "",
  editingLocked: false,
  activeDeadline: ""
};

const els = {
  accessBannerText: document.getElementById("accessBannerText"),
  searchLabel: document.getElementById("searchLabel"),
  sheetSelect: document.getElementById("sheetSelect"),
  laboratoryFilterBox: document.getElementById("laboratoryFilterBox"),
  laboratoryFilter: document.getElementById("laboratoryFilter"),
  searchInput: document.getElementById("searchInput"),
  btnRecargar: document.getElementById("btnRecargar"),
  supportFileInput: document.getElementById("supportFileInput"),
  supportToolbarCopy: document.getElementById("supportToolbarCopy"),
  supportToolbarActions: document.getElementById("supportToolbarActions"),
  backendBadge: document.getElementById("backendBadge"),
  successBadges: document.getElementById("successBadges"),
  statusMessage: document.getElementById("statusMessage"),
  tablaRetroBody: document.getElementById("tablaRetroBody")
};

document.addEventListener("DOMContentLoaded", () => {
  state.authorizedEmail = getAuthorizedEmailFromUrl();
  if (!state.authorizedEmail) {
    window.location.replace("login.html");
    return;
  }

  populateSheetOptions();
  refreshSearchUi();
  bindEvents();
  loadAllData();
});

function bindEvents() {
  els.sheetSelect.addEventListener("change", event => {
    state.currentSheetName = event.target.value;
    state.laboratoryFilter = "";
    loadAllData(true);
  });

  els.searchInput.addEventListener("input", handleSearch);
  els.laboratoryFilter.addEventListener("change", event => {
    state.laboratoryFilter = event.target.value || "";
    applyFilters();
  });
  els.btnRecargar.addEventListener("click", () => loadAllData(true));
  els.supportFileInput.addEventListener("change", handleSupportFileSelected);
  els.supportFileInput.setAttribute("accept", getAllowedExtensionsAccept());
}

function isAdminUser() {
  return CONFIG.adminEmails.includes(normalizeEmail(state.authorizedEmail));
}

function refreshSearchUi() {
  if (isAdminUser()) {
    els.searchLabel.textContent = "Buscar institucion, id de paciente o numero de muestra";
    els.searchInput.placeholder = "Escribe una institucion, ID de paciente o numero de muestra...";
    els.laboratoryFilterBox.classList.remove("is-hidden");
    return;
  }

  els.searchLabel.textContent = "Buscar institucion, id de paciente o numero de muestra";
  els.searchInput.placeholder = "Escribe una institucion, ID de paciente o numero de muestra...";
  els.laboratoryFilterBox.classList.remove("is-hidden");
}

function populateSheetOptions() {
  els.sheetSelect.innerHTML = CONFIG.availableSheets
    .map(sheetName => `<option value="${escapeHtml(sheetName)}">${escapeHtml(formatSheetLabel(sheetName))}</option>`)
    .join("");

  els.sheetSelect.value = state.currentSheetName;
}

async function loadAllData(forceRemoteRefresh = false) {
  if (!CONFIG.appsScriptUrl || CONFIG.appsScriptUrl.includes("PEGAR_AQUI")) {
    updateAccessBanner("Falta configurar la URL del Apps Script.");
    renderEmpty("Configura CONFIG.appsScriptUrl en script.js.");
    setScreenStatus("La app aun no esta conectada.");
    return;
  }

  updateAccessBanner(`Validando acceso para ${state.authorizedEmail}...`);
  setScreenStatus("Cargando informacion...");
  toggleReload(true);

  try {
    const payload = await fetchDataset(forceRemoteRefresh);
    refreshEditingRules();
    state.rows = normalizeRows(payload.rows || []);
    populateLaboratoryFilter();
    applyFilters();
    renderRows();
    updateBackendBadge();

    if (payload.accessDenied) {
      updateAccessBanner(`Sin acceso para ${state.authorizedEmail}.`);
      renderEmpty(payload.message || "El correo no tiene laboratorios asociados.");
      setScreenStatus(payload.message || "Correo no autorizado.");
      return;
    }

    updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
    if (state.editingLocked) {
      setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    } else if (hasLoadedSupportInVisibleRows()) {
      setScreenStatus(`Ya existe una base cargada para los ${state.rows.length} registros visibles.`);
    } else {
      setScreenStatus(`Se cargaron ${state.rows.length} registros visibles para ${formatSheetLabel(state.currentSheetName)}.`);
    }
  } catch (error) {
    console.error("No fue posible cargar la informacion:", error);
    renderEmpty("No fue posible cargar la informacion. Revisa la configuracion del Apps Script.");
    updateAccessBanner(`No fue posible validar el correo ${state.authorizedEmail}.`);
    setScreenStatus("Error cargando datos.");
  } finally {
    toggleReload(false);
  }
}

async function fetchDataset(forceRemoteRefresh) {
  const url = new URL(CONFIG.appsScriptUrl);
  url.searchParams.set("action", "list");
  url.searchParams.set("sheet", state.currentSheetName);
  url.searchParams.set("email", state.authorizedEmail);

  if (forceRemoteRefresh) {
    url.searchParams.set("t", Date.now().toString());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Respuesta no valida del servicio remoto: ${response.status}`);
  }

  return response.json();
}

function normalizeRows(rows) {
  return rows.map((row, index) => ({
    rowNumber: row.rowNumber || index + 2,
    laboratory: row.laboratory || "",
    origin: row.origin || "",
    patientId: row.patientId || "",
    institution: row.institution || "",
    specNum: row.specNum || "",
    specDate: row.specDate || "",
    feedback: row.feedback || "",
    response: row.response || "",
    labResponse: row.labResponse || "",
    linkBase: row.linkBase || "",
    isSaving: false,
    statusText: row.response ? "Observacion cargada." : "Sin observacion registrada.",
    labStatusText: row.labResponse ? "Observacion cargada." : "Sin observacion registrada."
  }));
}

function renderRows() {
  if (!state.filteredRows.length) {
    renderEmpty("No hay registros para mostrar con el filtro actual.");
    return;
  }

  const html = state.filteredRows.map(row => {
    const saveLabel = row.isSaving ? "Guardando..." : "Guardar";
    const statusClass = row.isSaving ? "pending" : row.response.trim() ? "success" : "";

    return `
      <tr data-row-key="${escapeHtml(getRowKey(row))}">
        <td>${escapeHtml(row.laboratory)}</td>
        <td>${escapeHtml(row.origin)}</td>
        <td>${escapeHtml(row.patientId)}</td>
        <td>${escapeHtml(row.institution)}</td>
        <td>${escapeHtml(row.specNum)}</td>
        <td>${escapeHtml(row.specDate)}</td>
        <td class="cell-feedback">${escapeHtml(row.feedback).replace(/\n/g, "<br>")}</td>
        <td class="cell-response">
          <textarea
            class="row-response"
            data-role="response"
            data-row-key="${escapeHtml(getRowKey(row))}"
            placeholder="Escribe aqui las observaciones de la UPGD..."
            ${state.editingLocked ? "disabled" : ""}
          >${escapeHtml(row.response)}</textarea>
          <div class="row-status ${statusClass}" data-role="status" data-row-key="${escapeHtml(getRowKey(row))}">
            ${escapeHtml(state.editingLocked ? `Edicion cerrada. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.` : row.statusText)}
          </div>
        </td>
        <td class="cell-response">
          <textarea
            class="row-response"
            data-role="labResponse"
            data-row-key="${escapeHtml(getRowKey(row))}"
            placeholder="Escribe aqui las observaciones de laboratorio..."
            ${state.editingLocked ? "disabled" : ""}
          >${escapeHtml(row.labResponse)}</textarea>
          <div class="row-status ${row.isSaving ? "pending" : row.labResponse.trim() ? "success" : ""}" data-role="labStatus" data-row-key="${escapeHtml(getRowKey(row))}">
            ${escapeHtml(state.editingLocked ? `Edicion cerrada. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.` : row.labStatusText)}
          </div>
        </td>
        <td>
          <button
            type="button"
            class="save-button"
            data-role="save"
            data-row-key="${escapeHtml(getRowKey(row))}"
            ${row.isSaving || state.editingLocked ? "disabled" : ""}
          >${saveLabel}</button>
        </td>
      </tr>
    `;
  }).join("");

  els.tablaRetroBody.innerHTML = html;
  bindRowEvents();
  autoResizeAllTextareas();
  refreshSupportToolbar();
}

function populateLaboratoryFilter() {
  const labs = [...new Set(
    state.rows
      .map(row => String(row.laboratory || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  els.laboratoryFilter.innerHTML = [
    '<option value="">Todos</option>',
    ...labs.map(lab => `<option value="${escapeHtml(lab)}">${escapeHtml(lab)}</option>`)
  ].join("");

  els.laboratoryFilter.value = state.laboratoryFilter;
}

function bindRowEvents() {
  if (state.editingLocked) {
    return;
  }

  els.tablaRetroBody.querySelectorAll('[data-role="save"]').forEach(button => {
    button.addEventListener("click", () => saveRow(button.dataset.rowKey));
  });

  els.tablaRetroBody.querySelectorAll('[data-role="response"]').forEach(textarea => {
    textarea.addEventListener("input", event => {
      const row = state.rows.find(item => getRowKey(item) === textarea.dataset.rowKey);
      if (!row) {
        return;
      }

      row.response = event.target.value;
      row.statusText = "Cambios pendientes por guardar.";
      syncFilteredRow(row);
      updateRowStatus(row, "pending");
      autoResizeTextarea(textarea);
    });
  });

  els.tablaRetroBody.querySelectorAll('[data-role="labResponse"]').forEach(textarea => {
    textarea.addEventListener("input", event => {
      const row = state.rows.find(item => getRowKey(item) === textarea.dataset.rowKey);
      if (!row) {
        return;
      }

      row.labResponse = event.target.value;
      row.labStatusText = "Cambios pendientes por guardar.";
      syncFilteredRow(row);
      updateRowStatus(row, "labStatus", "pending");
      autoResizeTextarea(textarea);
    });
  });
}

function syncFilteredRow(sourceRow) {
  state.filteredRows = state.filteredRows.map(row => (
    getRowKey(row) === getRowKey(sourceRow) ? sourceRow : row
  ));
}

function handleSearch(event) {
  applyFilters();
}

function applyFilters() {
  const query = (els.searchInput.value || "").trim().toLowerCase();
  const laboratoryFilter = state.laboratoryFilter;

  state.filteredRows = state.rows.filter(row => {
    const matchesLaboratory = !laboratoryFilter || row.laboratory === laboratoryFilter;
    if (!matchesLaboratory) {
      return false;
    }

    if (!query) {
      return true;
    }

    const joined = [
      row.laboratory,
      row.origin,
      row.patientId,
      row.institution,
      row.specNum,
      row.specDate,
      row.feedback,
      row.response,
      row.labResponse
    ].join(" ").toLowerCase();

    return joined.includes(query);
  });

  renderRows();
}

async function saveRow(rowKey) {
  if (state.editingLocked) {
    setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    return;
  }

  const row = state.rows.find(item => getRowKey(item) === rowKey);
  if (!row) {
    return;
  }

  row.isSaving = true;
  row.statusText = "Guardando cambios...";
  row.labStatusText = "Guardando cambios...";
  syncFilteredRow(row);
  renderRows();

  try {
    await saveResponseRemote(row);
    row.statusText = "Observacion guardada correctamente.";
    row.labStatusText = "Observacion guardada correctamente.";
  } catch (error) {
    console.error("Error guardando observaciones:", error);
    row.statusText = "No se pudo guardar la observacion.";
    row.labStatusText = "No se pudo guardar la observacion.";
  } finally {
    row.isSaving = false;
    syncFilteredRow(row);
    renderRows();
  }
}

async function generatePdfSupport() {
  const rows = getSupportTargetRows();
  if (state.isGeneratingPdf) {
    return;
  }

  if (!rows.length) {
    setScreenStatus("No hay registros visibles con observaciones para generar el PDF.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    setScreenStatus("No fue posible generar el PDF porque jsPDF no esta disponible.");
    return;
  }

  state.isGeneratingPdf = true;
  refreshSupportToolbar();

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
    await renderSupportPdf(doc, rows);
    doc.save(buildPdfFileName(rows));
    setScreenStatus(`PDF generado correctamente con ${rows.length} registros visibles.`);
  } catch (error) {
    console.error("Error generando PDF:", error);
    setScreenStatus("No fue posible generar el PDF.");
  } finally {
    state.isGeneratingPdf = false;
    refreshSupportToolbar();
  }
}

async function renderSupportPdf(doc, rows) {
  const logoDataUrl = await getImageDataUrl("IMAGE/encabezado.png");
  rows.forEach((row, index) => {
    if (index > 0) {
      doc.addPage();
    }

    renderSupportPdfPage(doc, row, index + 1, rows.length, logoDataUrl);
  });
}

function renderSupportPdfPage(doc, row, pageNumber, totalPages, logoDataUrl) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 30;
  const contentWidth = pageWidth - margin * 2;
  let y = 24;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", (pageWidth - 300) / 2, y, 300, 50);
    y += 62;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("RETROALIMENTACION CONTROL DE CALIDAD DE LAS BASES DE DATOS WHONET", pageWidth / 2, y, { align: "center" });
  y += 24;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Hoja: ${formatSheetLabel(state.currentSheetName)}`, margin, y);
  doc.text(`Registro ${pageNumber} de ${totalPages} | Generado: ${formatPdfDate(new Date())}`, pageWidth - margin, y, { align: "right" });
  y += 18;

  y = drawInfoGrid(doc, row, margin, y, contentWidth);
  y += 18;
  drawRetroTable(doc, row, margin, y, contentWidth, pageHeight - margin);
}

function drawInfoGrid(doc, row, x, y, width) {
  const fields = [
    ["Laboratorio", row.laboratory || "Sin dato"],
    ["Origen", row.origin || "Sin dato"],
    ["ID de paciente", row.patientId || "Sin dato"],
    ["Institucion", row.institution || "Sin dato"],
    ["Numero de muestra", row.specNum || "Sin dato"],
    ["Fecha de muestra", row.specDate || "Sin dato"]
  ];
  const columns = 3;
  const cellWidth = width / columns;
  const rowHeight = 34;

  doc.setLineWidth(0.6);
  fields.forEach((field, index) => {
    const col = index % columns;
    const rowIndex = Math.floor(index / columns);
    const cellX = x + col * cellWidth;
    const cellY = y + rowIndex * rowHeight;

    doc.setFillColor(22, 57, 98);
    doc.rect(cellX, cellY, cellWidth * 0.36, rowHeight, "FD");
    doc.setFillColor(255, 255, 255);
    doc.rect(cellX + cellWidth * 0.36, cellY, cellWidth * 0.64, rowHeight, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(255, 255, 255);
    doc.text(field[0], cellX + 6, cellY + 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text(doc.splitTextToSize(String(field[1]), cellWidth * 0.64 - 10), cellX + cellWidth * 0.36 + 6, cellY + 14);
  });

  return y + Math.ceil(fields.length / columns) * rowHeight;
}

function drawRetroTable(doc, row, x, y, width, bottomLimit) {
  const columns = [
    { title: "OBSERVACIONES", value: row.feedback || "Sin informacion registrada.", width: width * 0.36 },
    { title: "OBSERVACIONES DE UPGD", value: row.response || "Sin observacion registrada.", width: width * 0.32 },
    { title: "OBSERVACIONES DE LABORATORIO", value: row.labResponse || "Sin observacion registrada.", width: width * 0.32 }
  ];
  const headerHeight = 26;
  const bodyY = y + headerHeight;
  const bodyHeight = Math.max(150, bottomLimit - bodyY - 18);
  let currentX = x;

  doc.setLineWidth(0.6);
  columns.forEach(column => {
    doc.setFillColor(22, 57, 98);
    doc.rect(currentX, y, column.width, headerHeight, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(doc.splitTextToSize(column.title, column.width - 10), currentX + column.width / 2, y + 11, { align: "center" });

    doc.setFillColor(255, 255, 255);
    doc.rect(currentX, bodyY, column.width, bodyHeight, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text(doc.splitTextToSize(String(column.value), column.width - 12), currentX + 6, bodyY + 14);
    currentX += column.width;
  });
}

async function getImageDataUrl(path) {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = new URL(path, window.location.href).href;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("No fue posible cargar el encabezado para el PDF:", error);
    return "";
  }
}

function buildPdfFileName(rows) {
  const labs = [...new Set(rows.map(row => String(row.laboratory || "").trim()).filter(Boolean))];
  const parts = [
    "retro_dis",
    state.currentSheetName,
    labs.length === 1 ? labs[0] : "varios_laboratorios",
    `${rows.length}_registros`
  ].filter(Boolean);

  return `${sanitizeFileName(parts.join("_"))}.pdf`;
}

function sanitizeFileName(value) {
  return String(value || "retro_dis")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "retro_dis";
}

function formatPdfDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function handleSupportButtonClick() {
  if (state.editingLocked) {
    setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    return;
  }

  if (state.isUploadingSupport) {
    return;
  }

  const targetRows = getSupportTargetRows(state.pendingUploadLaboratory);
  if (!targetRows.length) {
    setScreenStatus("No hay registros visibles con observaciones para asociar el soporte.");
    return;
  }

  els.supportFileInput.value = "";
  els.supportFileInput.click();
}

function queueSupportUpload(laboratory) {
  state.pendingUploadLaboratory = laboratory || "";
  handleSupportButtonClick();
}

async function handleSupportFileSelected(event) {
  if (state.editingLocked) {
    setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    els.supportFileInput.value = "";
    return;
  }

  const file = event.target.files && event.target.files[0];
  const targetRows = getSupportTargetRows(state.pendingUploadLaboratory);

  if (!file) {
    return;
  }

  if (!targetRows.length) {
    setScreenStatus("No hay registros visibles con observaciones para asociar el soporte.");
    els.supportFileInput.value = "";
    return;
  }

  if (!isAllowedUploadFile(file.name)) {
    setScreenStatus(getInvalidFileMessage(targetRows[0]));
    els.supportFileInput.value = "";
    return;
  }

  const maxBytes = CONFIG.maxUploadSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    setScreenStatus(`El archivo supera el limite de ${CONFIG.maxUploadSizeMb} MB.`);
    els.supportFileInput.value = "";
    return;
  }

  state.isUploadingSupport = true;
  refreshSupportToolbar(file.name);
  setScreenStatus(`Subiendo soporte para ${targetRows.length} registros visibles...`);

  try {
    const base64Data = await fileToBase64(file);
    const payload = await uploadSupportRemote(targetRows, file, base64Data);
    targetRows.forEach(row => {
      row.linkBase = payload.supportUrl || row.linkBase;
      syncFilteredRow(row);
    });
    setScreenStatus(`Soporte cargado correctamente para ${targetRows.length} registros visibles.`);
  } catch (error) {
    console.error("Error subiendo soporte:", error);
    setScreenStatus(error.message || "No fue posible subir el soporte.");
  } finally {
    state.isUploadingSupport = false;
    state.pendingUploadLaboratory = "";
    els.supportFileInput.value = "";
    renderRows();
  }
}

function getSupportTargetRows(laboratory = "") {
  return state.filteredRows.filter(row => {
    const hasFeedback = String(row.feedback || "").trim();
    const matchesLaboratory = !laboratory || row.laboratory === laboratory;
    return hasFeedback && matchesLaboratory;
  });
}

function refreshSupportToolbar(selectedFileName = "") {
  const targetRows = getSupportTargetRows();
  const laboratoryGroups = getSupportLaboratoryGroups();
  const label = targetRows.length
    ? `Registros visibles con observaciones: ${targetRows.length}${selectedFileName ? ` | Archivo: ${selectedFileName}` : ""}`
    : "Sube una base por cada sigla visible con observaciones.";

  els.supportToolbarCopy.textContent = label;
  const uploadButtons = laboratoryGroups.map(group => `
    <button
      type="button"
      class="ghost-button support-toolbar-button"
      data-role="upload-laboratory"
      data-laboratory="${escapeHtml(group.laboratory)}"
      ${state.isUploadingSupport || state.editingLocked ? "disabled" : ""}
    >${state.isUploadingSupport && state.pendingUploadLaboratory === group.laboratory ? `Subiendo ${escapeHtml(group.laboratory)}...` : `Subir ${escapeHtml(group.laboratory)}`}</button>
  `).join("");

  const pdfButton = `
    <button
      type="button"
      class="ghost-button support-toolbar-button pdf-button"
      data-role="generate-pdf"
      ${!targetRows.length || state.isGeneratingPdf ? "disabled" : ""}
    >${state.isGeneratingPdf ? "Generando PDF..." : "Generar PDF"}</button>
  `;

  els.supportToolbarActions.innerHTML = `${uploadButtons}${pdfButton}`;

  els.supportToolbarActions.querySelectorAll('[data-role="upload-laboratory"]').forEach(button => {
    button.addEventListener("click", () => queueSupportUpload(button.dataset.laboratory));
  });
  const pdfButtonNode = els.supportToolbarActions.querySelector('[data-role="generate-pdf"]');
  if (pdfButtonNode) {
    pdfButtonNode.addEventListener("click", generatePdfSupport);
  }
  refreshLoadedSupportIndicator();
}

function getSupportLaboratoryGroups() {
  const laboratories = [...new Set(
    getSupportTargetRows()
      .map(row => String(row.laboratory || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  return laboratories.map(laboratory => ({ laboratory }));
}

async function saveResponseRemote(row) {
  const response = await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "saveResponse",
      sheetName: state.currentSheetName,
      email: state.authorizedEmail,
      rowNumber: row.rowNumber,
      response: row.response,
      labResponse: row.labResponse
    })
  });

  if (!response.ok) {
    throw new Error(`Respuesta no valida al guardar: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.message || "No fue posible guardar la observacion.");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("No fue posible leer el archivo seleccionado."));
    reader.readAsDataURL(file);
  });
}

async function uploadSupportRemote(rows, file, base64Data) {
  const response = await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "uploadSupport",
      sheetName: state.currentSheetName,
      email: state.authorizedEmail,
      rowNumbers: rows.map(row => row.rowNumber),
      institution: rows[0] ? rows[0].institution : "",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64Data
    })
  });

  if (!response.ok) {
    throw new Error(`Respuesta no valida al subir soporte: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.message || "No fue posible subir el soporte.");
  }

  return payload;
}

function updateRowStatus(row, roleOrClassName, className) {
  const role = className === undefined ? "status" : roleOrClassName;
  const statusClass = className === undefined ? roleOrClassName : className;
  const statusNode = els.tablaRetroBody.querySelector(`[data-role="${role}"][data-row-key="${CSS.escape(getRowKey(row))}"]`);
  if (!statusNode) {
    return;
  }

  statusNode.textContent = role === "labStatus" ? row.labStatusText : row.statusText;
  statusNode.className = `row-status ${statusClass || ""}`.trim();
}

function updateAccessBanner(message) {
  els.accessBannerText.textContent = message;
}

function updateBackendBadge() {
  els.backendBadge.textContent = state.usingRemote ? "Google Sheets" : "Sin conexion";
}

function setScreenStatus(message) {
  const normalizedMessage = String(message || "").toLowerCase();
  const isSuccess = normalizedMessage.includes("soporte cargado correctamente") || normalizedMessage.includes("ya existe una base cargada");
  els.statusMessage.classList.toggle("status-success", isSuccess);
  els.statusMessage.textContent = message;
  refreshSuccessBadges();
}

function refreshLoadedSupportIndicator() {
  const hasLoadedSupport = hasLoadedSupportInVisibleRows();

  if (!state.isUploadingSupport && hasLoadedSupport) {
    refreshSuccessBadges();
    return;
  }

  if (!String(els.statusMessage.textContent || "").toLowerCase().includes("soporte cargado correctamente")) {
    refreshSuccessBadges();
  }
}

function hasLoadedSupportInVisibleRows() {
  return getSupportTargetRows().some(row => String(row.linkBase || "").trim());
}

function refreshSuccessBadges() {
  const loadedGroups = getSupportLaboratoryGroups()
    .filter(group => getSupportTargetRows(group.laboratory).some(row => String(row.linkBase || "").trim()));

  els.successBadges.innerHTML = loadedGroups
    .map(group => `<span class="success-badge-inline">Soporte cargado ${escapeHtml(group.laboratory)}</span>`)
    .join("");
}

function toggleReload(disabled) {
  els.btnRecargar.disabled = disabled;
}

function refreshEditingRules() {
  const deadline = CONFIG.editDeadlines[state.currentSheetName] || "";
  state.activeDeadline = deadline;
  state.editingLocked = isEditingLocked(deadline);
}

function isEditingLocked(deadline) {
  if (!deadline) {
    return false;
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayString = `${year}-${month}-${day}`;
  return todayString > deadline;
}

function formatDeadlineForDisplay(deadline) {
  if (!deadline) {
    return "sin fecha limite";
  }

  const match = String(deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return deadline;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function renderEmpty(message) {
  els.tablaRetroBody.innerHTML = `
    <tr>
      <td colspan="10" class="empty-state">${escapeHtml(message)}</td>
    </tr>
  `;
}

function getRowKey(row) {
  return `${row.rowNumber}::${row.laboratory}::${row.specNum}`;
}

function formatSheetLabel(sheetName) {
  return String(sheetName || "").replace(/_/g, " ").toUpperCase();
}

function autoResizeAllTextareas() {
  els.tablaRetroBody.querySelectorAll(".row-response").forEach(autoResizeTextarea);
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 120)}px`;
}

function getFileExtension(fileName) {
  const match = String(fileName || "").trim().match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1].toUpperCase() : "";
}

function isAllowedUploadFile(fileName) {
  const row = getSupportTargetRows(state.pendingUploadLaboratory)[0];
  if (!row) {
    return false;
  }

  const match = String(fileName || "").trim().match(/^([^\\/:*?"<>|\r\n]+)$/);
  if (!match) {
    return false;
  }

  const extension = getFileExtension(fileName);
  const expectedBaseName = buildExpectedBaseName(row);

  if (!extension || !expectedBaseName) {
    return false;
  }

  const lastDotIndex = String(fileName).lastIndexOf(".");
  const baseName = lastDotIndex >= 0 ? String(fileName).slice(0, lastDotIndex) : String(fileName);

  return (
    baseName.toUpperCase() === expectedBaseName &&
    (extension === "SIR" || extension === "DBF" || extension === String(row.laboratory || "").trim().toUpperCase())
  );
}

function getAllowedExtensionsAccept() {
  return CONFIG.allowedUploadExtensions.map(ext => `.${ext.toLowerCase()}`).join(",");
}

function buildExpectedBaseName(row) {
  const sigla = String(row.laboratory || "").trim().toUpperCase();
  const parts = String(state.currentSheetName || "").trim().toUpperCase().split("_");
  const rawMonth = parts.length > 1 ? parts[1] : "";
  const year = parts.length > 2 ? parts[2] : "";
  const monthMap = {
    ENE: "ENE",
    ENERO: "ENE",
    FEB: "FEB",
    FEBRERO: "FEB",
    MAR: "MAR",
    MARZO: "MAR",
    ABR: "ABR",
    ABRIL: "ABR",
    MAY: "MAY",
    MAYO: "MAY",
    JUN: "JUN",
    JUNIO: "JUN",
    JUL: "JUL",
    JULIO: "JUL",
    AGO: "AGO",
    AGOSTO: "AGO",
    SEP: "SEP",
    SEPT: "SEP",
    SEPTIEMBRE: "SEP",
    OCT: "OCT",
    OCTUBRE: "OCT",
    NOV: "NOV",
    NOVIEMBRE: "NOV",
    DIC: "DIC",
    DICIEMBRE: "DIC"
  };
  const month = monthMap[rawMonth] || rawMonth.slice(0, 3);

  if (!sigla || !month || !year) {
    return "";
  }

  return `${sigla}_${month}_${year}`;
}

function getInvalidFileMessage(row) {
  const expectedBaseName = buildExpectedBaseName(row);
  const sigla = String(row && row.laboratory || "").trim().toUpperCase();
  return `Nombre no permitido. Debe ser ${expectedBaseName}.${sigla}, ${expectedBaseName}.SIR o ${expectedBaseName}.DBF`;
}

function getAuthorizedEmailFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeEmail(params.get("email") || "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
