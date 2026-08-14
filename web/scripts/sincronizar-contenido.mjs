#!/usr/bin/env node
/**
 * Genera src/content/docs a partir de dos fuentes:
 *
 *   1. El markdown del repositorio (banco de preguntas, cursos, entrevistas y guías).
 *      Se le añade frontmatter y se reescriben los enlaces relativos de fichero
 *      a rutas del sitio.
 *   2. Las páginas propias del sitio en src/paginas (landing y textos de portada).
 *
 * src/content/docs es 100% generado: no lo edites, edita el markdown del repo.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, dirname, resolve, relative, posix } from 'node:path';

const WEB = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const RAIZ = resolve(WEB, '..');
const DESTINO = join(WEB, 'src/content/docs');
const PAGINAS = join(WEB, 'src/paginas');
const REPO_BLOB = 'https://github.com/darwinva97/entrevistas-senior/blob/master';

/** Áreas del banco de preguntas. */
const AREAS = [
  'java-microservicios',
  'typescript-microservicios',
  'golang-microservicios',
  'cloud/aws',
  'cloud/azure',
  'cloud/gcp',
  'microfrontends',
  'seguridad-vulnerabilidades',
  'versionamiento-apis',
  'casos-de-estudio',
];

/** Ficheros sueltos del repo: origen → destino dentro de docs. */
const SUELTOS = {
  'README.md': 'guia/como-usar.md',
  'PLAN-DE-ESTUDIO.md': 'guia/plan-de-estudio.md',
  'GLOSARIO.md': 'guia/glosario.md',
  'PROGRESO.md': 'guia/progreso.md',
  'INDICE.md': 'banco/index.md',
  'CONTRIBUTING.md': 'contribuir.md',
};

/** Etiquetas cortas para la barra lateral cuando el título es largo. */
function etiquetaCorta(titulo) {
  const limpio = titulo
    .replace(/^Módulo\s+/i, '')
    .replace(/^Curso\s+\d+\s*·\s*/i, '')
    .replace(/\s+—\s+(Preguntas de Entrevista Senior|Entrevistas Senior)$/i, '')
    .replace(/\s+—\s+Preguntas de Entrevista Senior$/i, '')
    .replace(/^[🎯📑🗺️📖✅🤝🎓]\s*/u, '');
  return limpio.length > 48 ? `${limpio.slice(0, 45).trimEnd()}…` : limpio;
}

// ─────────────────────────────────────────────────────────────
// 1. Inventario de ficheros a publicar y su ruta destino
// ─────────────────────────────────────────────────────────────
/** @type {Array<{origen: string, destino: string}>} */
const ficheros = [];

for (const [origen, destino] of Object.entries(SUELTOS)) {
  ficheros.push({ origen, destino });
}

for (const area of AREAS) {
  for (const nombre of readdirSync(join(RAIZ, area)).sort()) {
    if (!nombre.endsWith('.md')) continue;
    const destino = nombre === 'README.md' ? `banco/${area}/index.md` : `banco/${area}/${nombre}`;
    ficheros.push({ origen: `${area}/${nombre}`, destino });
  }
}

for (const { ruta, relativa } of recorrer('cursos')) {
  ficheros.push({ origen: relativa, destino: relativa.replace(/README\.md$/, 'index.md') });
  void ruta;
}

if (existsSync(join(RAIZ, 'entrevistas'))) {
  for (const { relativa } of recorrer('entrevistas')) {
    // entrevistas/en/**  →  en/entrevistas/**   (versión inglesa)
    const destino = relativa.startsWith('entrevistas/en/')
      ? `en/entrevistas/${relativa.slice('entrevistas/en/'.length)}`
      : relativa;
    ficheros.push({ origen: relativa, destino: destino.replace(/README\.md$/, 'index.md') });
  }
}

/** Recorre un directorio del repo devolviendo sus .md. */
function recorrer(dir) {
  const salida = [];
  const base = join(RAIZ, dir);
  if (!existsSync(base)) return salida;
  for (const nombre of readdirSync(base).sort()) {
    const completa = join(base, nombre);
    const relativa = posix.join(dir, nombre);
    if (statSync(completa).isDirectory()) salida.push(...recorrer(relativa));
    else if (nombre.endsWith('.md')) salida.push({ ruta: completa, relativa });
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────
// 2. Mapa  ruta-del-repo → URL del sitio
// ─────────────────────────────────────────────────────────────
const urlPorOrigen = new Map();
for (const { origen, destino } of ficheros) {
  urlPorOrigen.set(origen, `/${destino.replace(/(index)?\.md$/, '').replace(/\/$/, '')}/`.replace('//', '/'));
}

function urlDe(rutaRepo) {
  if (urlPorOrigen.has(rutaRepo)) return urlPorOrigen.get(rutaRepo);
  const comoDirectorio = posix.join(rutaRepo.replace(/\/$/, ''), 'README.md');
  if (urlPorOrigen.has(comoDirectorio)) return urlPorOrigen.get(comoDirectorio);
  return null;
}

// ─────────────────────────────────────────────────────────────
// 3. Transformación de cada fichero
// ─────────────────────────────────────────────────────────────
rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });

let publicados = 0;
for (const { origen, destino } of ficheros) {
  const bruto = readFileSync(join(RAIZ, origen), 'utf8');
  const esIngles = destino.startsWith('en/');
  const { titulo, descripcion, cuerpo } = despiezar(bruto);

  const frontmatter = [
    '---',
    `title: ${yaml(titulo)}`,
    descripcion ? `description: ${yaml(descripcion)}` : null,
    `sidebar:`,
    `  label: ${yaml(etiquetaCorta(titulo))}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n') + '\n\n';

  const contenido = frontmatter + reescribirEnlaces(cuerpo, origen, esIngles);
  const salida = join(DESTINO, destino);
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, contenido);
  publicados++;
}

/** Separa el H1 (título), la primera frase (descripción) y el resto del cuerpo. */
function despiezar(markdown) {
  const lineas = markdown.split('\n');
  let titulo = 'Sin título';
  let i = 0;
  for (; i < lineas.length; i++) {
    const m = /^#\s+(.*)$/.exec(lineas[i]);
    if (m) {
      titulo = m[1].trim();
      i++;
      break;
    }
  }
  const cuerpo = lineas.slice(i).join('\n').replace(/^\s*\n/, '');
  const parrafo = cuerpo
    .split('\n')
    .find((l) => l.trim() && !l.startsWith('>') && !l.startsWith('|') && !l.startsWith('#') && !l.startsWith('```'));
  const descripcion = parrafo
    ? parrafo
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*`_]/g, '')
        .trim()
        .slice(0, 155)
    : '';
  return { titulo: limpiarEmoji(titulo), descripcion, cuerpo };
}

function limpiarEmoji(texto) {
  return texto.replace(/^[\p{Extended_Pictographic}️\s]+/u, '').trim() || texto.trim();
}

function yaml(valor) {
  return `"${String(valor).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Reescribe los enlaces relativos de fichero a rutas del sitio. */
function reescribirEnlaces(markdown, origen, esIngles) {
  const dirOrigen = posix.dirname(origen);
  let enCodigo = false;
  return markdown
    .split('\n')
    .map((linea) => {
      if (/^\s*```/.test(linea)) {
        enCodigo = !enCodigo;
        return linea;
      }
      if (enCodigo) return linea;
      return linea.replace(/\]\(([^)\s]+)\)/g, (completo, destino) => {
        if (/^(https?:|mailto:|#|\/)/.test(destino)) return completo;
        const [ruta, ancla] = destino.split('#');
        const repoRel = posix.normalize(posix.join(dirOrigen, ruta)).replace(/^\.\//, '');
        const url = urlDe(repoRel);
        if (!url) return `](${REPO_BLOB}/${repoRel})`;
        const prefijo = esIngles ? '/en' : '';
        return `](${prefijo}${url}${ancla ? `#${ancla}` : ''})`;
      });
    })
    .join('\n');
}

// ─────────────────────────────────────────────────────────────
// 4. Páginas propias del sitio (landing y portadas)
// ─────────────────────────────────────────────────────────────
if (existsSync(PAGINAS)) {
  cpSync(PAGINAS, DESTINO, { recursive: true });
}

console.log(`✅ Contenido sincronizado: ${publicados} páginas desde el repo + páginas propias del sitio.`);
