# LISTA_RETRO_DIS

Formulario web para revisar retroalimentacion DIS filtrada por correo autorizado y por siglas del laboratorio.

## Como funciona

- `login.html` valida el correo contra la hoja `ACCESO`.
- `index.html`, `styles.css` y `script.js` forman la interfaz.
- `Code.gs` consulta Google Sheets, filtra por `LABORATORY` usando las siglas asociadas al correo y guarda la respuesta en `RESPUESTA UPGD`.

## Estructura asumida del archivo

- Hoja de datos: `BOG_FEB_2026`
- Hoja de accesos: `ACCESO`
- Inicio de datos: fila `2`
- Columnas visibles:
  - `A` `COUNTRY_A`
  - `B` `LABORATORY`
  - `C` `ORIGIN`
  - `D` `PATIENT_ID`
  - `L` `INSTITUT`
  - `O` `SPEC_NUM`
  - `P` `SPEC_DATE`
  - `DZ` `Obsevaciones`
  - `EA` `RESPUESTA UPGD`

## Configuracion

1. Sube o convierte el archivo en Google Sheets.
2. Abre `Extensiones > Apps Script`.
3. Copia el contenido de `Code.gs`.
4. Reemplaza `SPREADSHEET_ID` por el ID real del Google Sheet.
5. Despliega como aplicacion web.
6. Copia la URL del despliegue y pegala en:
   - `script.js`
   - `login.html`

## Regla de acceso

- La hoja `ACCESO` debe tener:
  - Columna `B`: sigla
  - Columna `C`: correo autorizado
- Cada correo solo ve filas cuyo `LABORATORY` coincida con alguna sigla autorizada.
