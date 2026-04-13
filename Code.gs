const SPREADSHEET_ID = "1Ca5o6tYxBWbeUx3ZVhafK40kAuUzJJUxCGEFYoMzOt8";
const DEFAULT_SHEET_NAME = "BOG_FEB_2026";
const ACCESS_SHEET_NAME = "ACCESO";
const DATA_START_ROW = 2;

const COLUMNS = {
  laboratory: 2,
  origin: 3,
  patientId: 4,
  institution: 12,
  specNum: 15,
  specDate: 16,
  feedback: 130,
  response: 131,
  labResponse: 132,
  linkBase: 133
};

const DRIVE_FOLDER_IDS = {
  ENERO: "1ZnkQnEf5dj-gMn2mq5Hfd2AVsUQnRSGe",
  FEBRERO: "1FyYcD34KQBJDsu3po_t1AlJ_z32a3FSV",
  MARZO: "1s-UqtJImDWYSCuqk1EE6RuMsJrSRP9p0",
  ABRIL: "1Z2G_jdHkiWQKNcL3DWCcAYmLuXF2bAdQ",
  MAYO: "1OANcsWDQy5_wwBw5aVjVVXsgXi59aCbC",
  JUNIO: "1_hXaS1IHNzHmJ_0hpux-pWW-RjBbOA3T",
  JULIO: "1gBAPIS_-3iURq9pRzz5qCW_eK2ouwpYu",
  AGOSTO: "1eCeS010H6OnvwVEi4FVb9Qx2QsUEZaim",
  SEPTIEMBRE: "1afBj4V92abqG1i2Jx6ccvNrZMk942Y8G",
  OCTUBRE: "1dotqe8KdboOUWvV63JIQjoE01fUr-fSB",
  NOVIEMBRE: "1QufQATf_UUUuOvC5d46-0BI88Wmyhtyc",
  DICIEMBRE: "1jl2Vdhatd-CFkO2BVFnPXECZLeNvspO_"
};

const ALLOWED_UPLOAD_EXTENSIONS = [
  "SIR", "DBF", "COL", "ACP", "BIS", "CCC", "CVC", "CAF", "CSB", "FTI",
  "CPO", "CUC", "CAZ", "CFN", "NCC", "CRS", "CCR", "CLM", "CDM", "ADC",
  "CDO", "CIC", "SML", "JNC", "NOG", "CME", "PRO", "CLN", "NEL", "CLP",
  "CRH", "CPC", "CCO", "COC", "HUS", "HET", "HLV", "HOK", "SCL", "HSB",
  "TRA", "CLS", "FCI", "HLM", "FSC", "HCP", "HIJ", "HMS", "HMC", "HBU",
  "HSR", "FSB", "HUM", "HUN", "HSI", "ICB", "INC", "IIR", "IMC", "CMC",
  "MFI", "MEF", "HSJ", "HDB", "HDS", "HCH", "HDF", "JEG", "IMI", "HDT",
  "SAP", "HEN", "TUN", "UMO", "PSS"
];

const ADMIN_EMAILS = [
  "infeccionesasociadassaludiaas@gmail.com"
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "list";
  const sheetName = (e && e.parameter && e.parameter.sheet) || DEFAULT_SHEET_NAME;
  const email = normalizeEmail_((e && e.parameter && e.parameter.email) || "");

  if (action === "list") {
    return jsonOutput(buildDataset_(sheetName, email));
  }

  if (action === "validateEmail") {
    return jsonOutput(validateEmailAccess_(email));
  }

  return jsonOutput({
    success: false,
    message: "Accion no soportada."
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = payload.action || "";

    if (action === "saveResponse") {
      return saveResponse_(payload);
    }

    if (action === "uploadSupport") {
      return uploadSupport_(payload);
    }

    return jsonOutput({
      success: false,
      message: "Accion no soportada."
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      message: error.message || "No fue posible procesar la solicitud."
    });
  }
}

function saveResponse_(payload) {
  const sheetName = payload.sheetName || DEFAULT_SHEET_NAME;
  const sheet = getSheet_(sheetName);
  const rowNumber = Number(payload.rowNumber);
  const email = normalizeEmail_(payload.email || "");

  if (!rowNumber || rowNumber < DATA_START_ROW) {
    throw new Error("Numero de fila no valido.");
  }

  assertRowEmailAuthorized_(sheet, rowNumber, email);
  sheet.getRange(rowNumber, COLUMNS.response).setValue(payload.response || "");
  sheet.getRange(rowNumber, COLUMNS.labResponse).setValue(payload.labResponse || "");

  return jsonOutput({
    success: true,
    message: "Observacion guardada correctamente.",
    rowNumber
  });
}

function uploadSupport_(payload) {
  const sheetName = payload.sheetName || DEFAULT_SHEET_NAME;
  const sheet = getSheet_(sheetName);
  const rowNumbers = Array.isArray(payload.rowNumbers)
    ? payload.rowNumbers.map(item => Number(item)).filter(item => item >= DATA_START_ROW)
    : [];
  const email = normalizeEmail_(payload.email || "");
  const base64Data = payload.base64Data || "";
  const fileName = payload.fileName || "archivo";
  const mimeType = payload.mimeType || "application/octet-stream";

  if (!rowNumbers.length) {
    throw new Error("No se recibieron filas validas para asociar el soporte.");
  }

  if (!base64Data) {
    throw new Error("No se recibio el archivo.");
  }

  rowNumbers.forEach(rowNumber => {
    assertRowEmailAuthorized_(sheet, rowNumber, email);
  });

  validateUploadFileName_(fileName, sheetName, sheet.getRange(rowNumbers[0], COLUMNS.laboratory).getDisplayValue());

  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType,
    buildSupportFileName_(fileName)
  );

  const folder = getMonthFolder_(sheetName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  rowNumbers.forEach(rowNumber => {
    sheet.getRange(rowNumber, COLUMNS.linkBase).setValue(file.getUrl());
  });

  return jsonOutput({
    success: true,
    message: "Soporte cargado correctamente.",
    rowNumbers,
    supportUrl: file.getUrl(),
    supportName: file.getName()
  });
}

function buildDataset_(sheetName, email) {
  const activeSheetName = getSheetName_(sheetName);
  const sheet = getSheet_(activeSheetName);
  const lastRow = sheet.getLastRow();
  const totalRows = Math.max(lastRow - DATA_START_ROW + 1, 0);
  const normalizedEmail = normalizeEmail_(email);
  const isAdmin = isAdminEmail_(normalizedEmail);
  const allowedSiglas = isAdmin ? [] : getAuthorizedSiglasForEmail_(normalizedEmail);

  const rows = [];

  if (totalRows > 0) {
    const values = sheet.getRange(DATA_START_ROW, 1, totalRows, COLUMNS.linkBase).getDisplayValues();

    values.forEach((row, index) => {
      const laboratory = String(row[COLUMNS.laboratory - 1] || "").trim();
      const feedback = String(row[COLUMNS.feedback - 1] || "").trim();

      if (!laboratory) {
        return;
      }

      if (!feedback) {
        return;
      }

      if (!isAdmin && (!normalizedEmail || !allowedSiglas.includes(laboratory))) {
        return;
      }

      rows.push({
        rowNumber: DATA_START_ROW + index,
        laboratory,
        origin: row[COLUMNS.origin - 1] || "",
        patientId: row[COLUMNS.patientId - 1] || "",
        institution: row[COLUMNS.institution - 1] || "",
        specNum: row[COLUMNS.specNum - 1] || "",
        specDate: row[COLUMNS.specDate - 1] || "",
        feedback,
        response: row[COLUMNS.response - 1] || "",
        labResponse: row[COLUMNS.labResponse - 1] || "",
        linkBase: row[COLUMNS.linkBase - 1] || ""
      });
    });
  }

  if (normalizedEmail && !isAdmin && rows.length === 0) {
    return {
      success: true,
      accessDenied: true,
      message: `El correo ${normalizedEmail} no cuenta con acceso.`,
      rows: []
    };
  }

  return {
    success: true,
    accessDenied: false,
    rows
  };
}

function validateEmailAccess_(email) {
  const normalizedEmail = normalizeEmail_(email);

  if (!normalizedEmail) {
    return {
      success: false,
      accessGranted: false,
      message: "Debes ingresar un correo."
    };
  }

  if (isAdminEmail_(normalizedEmail)) {
    return {
      success: true,
      accessGranted: true,
      message: "Correo administrador autorizado.",
      email: normalizedEmail,
      sheets: getSpreadsheet_().getSheets().map(sheet => sheet.getName()),
      isAdmin: true
    };
  }

  const siglas = getAuthorizedSiglasForEmail_(normalizedEmail);
  if (!siglas.length) {
    return {
      success: true,
      accessGranted: false,
      message: `El correo ${normalizedEmail} no cuenta con acceso.`
    };
  }

  return {
    success: true,
    accessGranted: true,
    message: "Correo autorizado.",
    email: normalizedEmail,
    siglas,
    sheets: [DEFAULT_SHEET_NAME]
  };
}

function getAuthorizedSiglasForEmail_(email) {
  const normalizedEmail = normalizeEmail_(email);
  if (!normalizedEmail) {
    return [];
  }

  const accessSheet = getSheet_(ACCESS_SHEET_NAME);
  const lastRow = accessSheet.getLastRow();
  const totalRows = Math.max(lastRow - 1, 0);

  if (!totalRows) {
    return [];
  }

  const values = accessSheet.getRange(2, 1, totalRows, 3).getDisplayValues();
  const siglas = [];

  values.forEach(row => {
    const sigla = String(row[1] || "").trim().toUpperCase();
    const authorizedCell = String(row[2] || "");

    if (!sigla || !authorizedCell) {
      return;
    }

    const emails = authorizedCell
      .split(/[,;\n]/)
      .map(item => normalizeEmail_(item))
      .filter(item => item && item !== "-" && item !== "--" && item !== "---" && item !== "-----------");

    if (emails.includes(normalizedEmail) && !siglas.includes(sigla)) {
      siglas.push(sigla);
    }
  });

  return siglas;
}

function assertRowEmailAuthorized_(sheet, rowNumber, email) {
  const normalizedEmail = normalizeEmail_(email);

  if (!normalizedEmail) {
    throw new Error("No se recibio un correo autorizado.");
  }

  if (isAdminEmail_(normalizedEmail)) {
    return;
  }

  const laboratory = String(sheet.getRange(rowNumber, COLUMNS.laboratory).getDisplayValue() || "").trim();
  const allowedSiglas = getAuthorizedSiglasForEmail_(normalizedEmail);

  if (!laboratory || !allowedSiglas.includes(laboratory)) {
    throw new Error("El correo no tiene permiso para modificar este laboratorio.");
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_(sheetName) {
  const spreadsheet = getSpreadsheet_();
  const targetSheetName = getSheetName_(sheetName);
  const sheet = spreadsheet.getSheetByName(targetSheetName);

  if (!sheet) {
    throw new Error(`No existe la hoja ${targetSheetName}.`);
  }

  return sheet;
}

function getSheetName_(sheetName) {
  const cleaned = String(sheetName || "").trim();
  return cleaned || DEFAULT_SHEET_NAME;
}

function isAdminEmail_(email) {
  return ADMIN_EMAILS.includes(normalizeEmail_(email));
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateUploadFileName_(fileName, sheetName, laboratory) {
  const extension = getFileExtension_(fileName);
  const sigla = String(laboratory || "").trim().toUpperCase();
  const expectedBaseName = buildExpectedBaseName_(sheetName, sigla);
  const lastDotIndex = String(fileName || "").lastIndexOf(".");
  const baseName = lastDotIndex >= 0
    ? String(fileName || "").slice(0, lastDotIndex).toUpperCase()
    : String(fileName || "").toUpperCase();

  if (!extension || !ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) {
    throw new Error("Extension no permitida.");
  }

  if (extension !== "SIR" && extension !== "DBF" && extension !== sigla) {
    throw new Error(`La extension debe ser .${sigla}, .SIR o .DBF.`);
  }

  if (baseName !== expectedBaseName) {
    throw new Error(`Nombre no permitido. Debe ser ${expectedBaseName}.${sigla}, ${expectedBaseName}.SIR o ${expectedBaseName}.DBF`);
  }
}

function getFileExtension_(fileName) {
  const match = String(fileName || "").trim().match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1].toUpperCase() : "";
}

function buildSupportFileName_(fileName) {
  const match = String(fileName || "").trim().match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
  const baseName = match ? match[1] : "archivo";
  const extension = match && match[2] ? match[2] : "";

  const cleanBase = String(baseName || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "archivo";

  return `${cleanBase}${extension}`;
}

function buildExpectedBaseName_(sheetName, sigla) {
  const normalizedSigla = String(sigla || "").trim().toUpperCase();
  const normalizedSheet = String(sheetName || DEFAULT_SHEET_NAME).trim().toUpperCase();
  const parts = normalizedSheet.split("_");
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

  if (!normalizedSigla || !month || !year) {
    throw new Error("No fue posible construir el nombre esperado del archivo.");
  }

  return `${normalizedSigla}_${month}_${year}`;
}

function getMonthFolder_(sheetName) {
  const monthFolderName = getMonthFolderName_(sheetName);
  const folderId = DRIVE_FOLDER_IDS[monthFolderName];

  if (!folderId) {
    throw new Error(`No hay carpeta configurada para el mes ${monthFolderName}.`);
  }

  return DriveApp.getFolderById(folderId);
}

function getMonthFolderName_(sheetName) {
  const normalized = String(sheetName || DEFAULT_SHEET_NAME).trim().toUpperCase();

  if (normalized.indexOf("ENE") >= 0) return "ENERO";
  if (normalized.indexOf("FEB") >= 0) return "FEBRERO";
  if (normalized.indexOf("MAR") >= 0) return "MARZO";
  if (normalized.indexOf("ABR") >= 0) return "ABRIL";
  if (normalized.indexOf("MAY") >= 0) return "MAYO";
  if (normalized.indexOf("JUN") >= 0) return "JUNIO";
  if (normalized.indexOf("JUL") >= 0) return "JULIO";
  if (normalized.indexOf("AGO") >= 0) return "AGOSTO";
  if (normalized.indexOf("SEP") >= 0) return "SEPTIEMBRE";
  if (normalized.indexOf("OCT") >= 0) return "OCTUBRE";
  if (normalized.indexOf("NOV") >= 0) return "NOVIEMBRE";
  if (normalized.indexOf("DIC") >= 0) return "DICIEMBRE";

  throw new Error(`No fue posible identificar el mes de la hoja ${sheetName}.`);
}

function autorizarDrive() {
  const firstFolderId = DRIVE_FOLDER_IDS.ENERO;
  const folder = DriveApp.getFolderById(firstFolderId);
  const tempFile = folder.createFile("permiso_tmp.txt", "ok");
  tempFile.setTrashed(true);
  SpreadsheetApp.openById(SPREADSHEET_ID);
}
