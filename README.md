# LISTA_RETRO_DIS

Formulario web para revisar retroalimentacion DIS filtrada por correo autorizado y por siglas del laboratorio.

## Como funciona

- `login.html` valida el correo contra la hoja `ACCESO`.
- `index.html`, `styles.css` y `script.js` forman la interfaz.
- `Code.gs` consulta Google Sheets, filtra por laboratorio usando las siglas asociadas al correo y separa permisos de epidemiologia, laboratorio y supervisor.
- La interfaz permite descargar un PDF consolidado con todos los registros visibles.

## Estructura asumida del archivo

- Hoja de datos: `BOG_FEB_2026`
- Hoja de accesos: `ACCESO`
- Inicio de datos: fila `2`
- Columnas visibles:
  - `B` `Laboratorio`
  - `C` `Origen`
  - `D` `ID de paciente`
  - `L` `Institucion`
  - `O` `Numero de muestra`
  - `P` `Fecha de muestra`
  - `DZ` `Obsevaciones`
  - `EA` `OBSERVACIONES DE UPGD`
  - `EB` `OBSERVACIONES DE LABORATORIO`
  - `EC` `ENLACE DE BASE`

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
  - Columna `C`: correo de epidemiologia
  - Columna `D`: correo de laboratorio
  - Columna `E`: correo supervisor
- Epidemiologia edita `OBSERVACIONES DE UPGD` y carga soportes.
- Laboratorio edita `OBSERVACIONES DE LABORATORIO`.
- Si la columna `D` esta vacia para una sigla, el correo de epidemiologia tambien puede editar laboratorio.
- Supervisor solo ve los registros de sus siglas, sin modificar informacion.
- El correo administrador conserva acceso total.
