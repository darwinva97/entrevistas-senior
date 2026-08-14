import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Raíz del repositorio (este fichero vive en scripts/lib/). */
export const RAIZ = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * Áreas del banco de preguntas, en el orden en que se muestran.
 * `dir` es relativo a la raíz del repositorio.
 */
export const AREAS = [
  { dir: 'java-microservicios', titulo: 'Java Senior + Microservicios', emoji: '☕' },
  { dir: 'typescript-microservicios', titulo: 'TypeScript Senior + Microservicios', emoji: '🟦' },
  { dir: 'golang-microservicios', titulo: 'Golang Senior + Microservicios', emoji: '🐹' },
  { dir: 'cloud/aws', titulo: 'AWS', emoji: '☁️' },
  { dir: 'cloud/azure', titulo: 'Azure', emoji: '☁️' },
  { dir: 'cloud/gcp', titulo: 'GCP', emoji: '☁️' },
  { dir: 'microfrontends', titulo: 'Microfrontends', emoji: '🧩' },
  { dir: 'seguridad-vulnerabilidades', titulo: 'Seguridad y Vulnerabilidades', emoji: '🔐' },
  { dir: 'versionamiento-apis', titulo: 'Versionamiento de APIs', emoji: '🔄' },
  { dir: 'casos-de-estudio', titulo: 'Casos de Estudio Transversales', emoji: '🧠' },
];

/**
 * Genera el ancla que GitHub asigna a un encabezado.
 * Regla: minúsculas, se eliminan los caracteres que no sean letra, dígito,
 * espacio, guion o guion bajo (los acentos y la ñ se conservan) y **cada**
 * espacio pasa a guion (dos espacios seguidos producen dos guiones).
 */
export function ancla(texto) {
  return texto
    .trim()
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Divide el markdown en líneas marcando cuáles están dentro de un bloque de código. */
function lineasConContexto(contenido) {
  let enCodigo = false;
  return contenido.split('\n').map((linea, i) => {
    if (/^\s*```/.test(linea)) enCodigo = !enCodigo;
    return { texto: linea, numero: i + 1, enCodigo };
  });
}

/** Ficheros de preguntas (NN-*.md) de un área, ordenados. */
export function ficherosDeArea(dir) {
  const ruta = join(RAIZ, dir);
  return readdirSync(ruta)
    .filter((f) => /^\d{2}-.*\.md$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Extrae las preguntas de un fichero del banco.
 * Devuelve { fichero, titulo, preguntas: [{ numero, titulo, ancla, categoria, tipo, esCaso, linea, tieneResumen, tieneDetalle }] }
 */
export function leerFichero(ficheroRelativo) {
  const contenido = readFileSync(join(RAIZ, ficheroRelativo), 'utf8');
  const lineas = lineasConContexto(contenido);
  const anclasUsadas = new Map();

  const h1 = lineas.find((l) => !l.enCodigo && /^# /.test(l.texto));
  const preguntas = [];

  for (let i = 0; i < lineas.length; i++) {
    const { texto, enCodigo, numero } = lineas[i];
    if (enCodigo) continue;
    const m = /^## (\d+)\.\s+(.*)$/.exec(texto);
    if (!m) continue;

    const tituloCrudo = m[2].trim();
    let base = ancla(`${m[1]}. ${tituloCrudo}`);
    const vistas = anclasUsadas.get(base) ?? 0;
    anclasUsadas.set(base, vistas + 1);
    if (vistas > 0) base = `${base}-${vistas}`;

    // El bloque de la pregunta llega hasta el siguiente encabezado de pregunta.
    const fin = lineas.findIndex((l, j) => j > i && !l.enCodigo && /^## \d+\./.test(l.texto));
    const bloque = lineas.slice(i, fin === -1 ? lineas.length : fin);
    const meta = bloque.find((l) => /^\*\*Categoría:\*\*/.test(l.texto))?.texto ?? '';
    const categoria = /\*\*Categoría:\*\*\s*([^·]+)/.exec(meta)?.[1].trim() ?? '';
    const tipo = /\*\*Tipo:\*\*\s*(.+)$/.exec(meta)?.[1].trim() ?? '';

    preguntas.push({
      numero: Number(m[1]),
      titulo: tituloCrudo,
      ancla: base,
      categoria,
      tipo,
      esCaso: /\[CASO\]/.test(meta),
      linea: numero,
      tieneResumen: bloque.some((l) => /^### 📝 Respuesta resumen/.test(l.texto)),
      tieneDetalle: bloque.some((l) => /^### 📖 Respuesta detallada/.test(l.texto)),
    });
  }

  return {
    fichero: ficheroRelativo,
    titulo: h1 ? h1.texto.replace(/^#\s+/, '').trim() : ficheroRelativo,
    preguntas,
  };
}

/** Todo el banco: [{ area, ficheros: [...] }] */
export function leerBanco() {
  return AREAS.map((area) => ({
    ...area,
    ficheros: ficherosDeArea(area.dir).map(leerFichero),
  }));
}

/** Total de preguntas de un área ya leída. */
export function totalArea(area) {
  return area.ficheros.reduce((n, f) => n + f.preguntas.length, 0);
}

/** Todos los ficheros markdown del repositorio (para validar enlaces). */
export function todosLosMarkdown(base = RAIZ) {
  const salida = [];
  for (const entrada of readdirSync(base)) {
    if (entrada === '.git' || entrada === 'node_modules') continue;
    const completa = join(base, entrada);
    if (statSync(completa).isDirectory()) salida.push(...todosLosMarkdown(completa));
    else if (entrada.endsWith('.md')) salida.push(relative(RAIZ, completa).split(sep).join('/'));
  }
  return salida.sort();
}

/** Anclas disponibles en un fichero markdown (todos los encabezados). */
export function anclasDe(ficheroRelativo) {
  const contenido = readFileSync(join(RAIZ, ficheroRelativo), 'utf8');
  const usadas = new Map();
  const anclas = new Set();
  for (const { texto, enCodigo } of lineasConContexto(contenido)) {
    if (enCodigo) continue;
    const m = /^#{1,6}\s+(.*)$/.exec(texto);
    if (!m) continue;
    let base = ancla(m[1].replace(/`/g, ''));
    const vistas = usadas.get(base) ?? 0;
    usadas.set(base, vistas + 1);
    anclas.add(vistas > 0 ? `${base}-${vistas}` : base);
  }
  return anclas;
}
