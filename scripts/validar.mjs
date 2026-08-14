#!/usr/bin/env node
/**
 * Valida la coherencia del repositorio:
 *   1. Formato de cada pregunta (numeración, categoría, resumen y detalle).
 *   2. Conteos de la tabla del README frente a las preguntas reales.
 *   3. Enlaces internos: que el fichero exista y que el ancla exista dentro de él.
 *
 *   node scripts/validar.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { RAIZ, leerBanco, totalArea, todosLosMarkdown, anclasDe } from './lib/banco.mjs';

const errores = [];
const avisos = [];

// ─────────────────────────────────────────────────────────────
// 1. Formato de las preguntas
// ─────────────────────────────────────────────────────────────
const banco = leerBanco();
for (const area of banco) {
  for (const fichero of area.ficheros) {
    if (fichero.preguntas.length === 0) {
      errores.push(`${fichero.fichero}: no contiene ninguna pregunta ("## N. Título")`);
      continue;
    }
    fichero.preguntas.forEach((p, i) => {
      const donde = `${fichero.fichero}:${p.linea}`;
      if (p.numero !== i + 1) {
        errores.push(`${donde}: numeración fuera de orden (esperaba ${i + 1}, encontró ${p.numero})`);
      }
      if (!p.categoria) errores.push(`${donde}: falta la línea "**Categoría:** ... · **Tipo:** ..."`);
      if (!p.tipo) avisos.push(`${donde}: falta "**Tipo:**" en la línea de categoría`);
      if (!p.tieneResumen) errores.push(`${donde}: falta "### 📝 Respuesta resumen"`);
      if (!p.tieneDetalle) errores.push(`${donde}: falta "### 📖 Respuesta detallada"`);
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Conteos declarados en el README raíz
// ─────────────────────────────────────────────────────────────
const readme = readFileSync(join(RAIZ, 'README.md'), 'utf8');
const total = banco.reduce((n, a) => n + totalArea(a), 0);

for (const area of banco) {
  const esperado = totalArea(area);
  const fila = readme
    .split('\n')
    .find((l) => l.includes(`(${area.dir}/)`) && l.trim().startsWith('|'));
  if (!fila) {
    avisos.push(`README.md: no encuentro la fila de la tabla para "${area.dir}/"`);
    continue;
  }
  const celdas = fila.split('|').map((c) => c.trim());
  const declarado = celdas.map(Number).find((n) => Number.isInteger(n) && n > 0);
  if (declarado !== esperado) {
    errores.push(`README.md: el área "${area.dir}" declara ${declarado} preguntas pero hay ${esperado}`);
  }
}
if (!readme.includes(String(total))) {
  avisos.push(`README.md: no aparece el total de preguntas (${total})`);
}

// ─────────────────────────────────────────────────────────────
// 3. Enlaces internos
// ─────────────────────────────────────────────────────────────
const ficheros = todosLosMarkdown();
const cacheAnclas = new Map();
const ENLACE = /\[[^\]]*\]\(([^)\s]+)\)/g;

for (const fichero of ficheros) {
  const contenido = readFileSync(join(RAIZ, fichero), 'utf8');
  let enCodigo = false;
  contenido.split('\n').forEach((linea, i) => {
    if (/^\s*```/.test(linea)) { enCodigo = !enCodigo; return; }
    if (enCodigo) return;
    const sinCodigoEnLinea = linea.replace(/`[^`]*`/g, '``');   // ignora código en línea
    for (const m of sinCodigoEnLinea.matchAll(ENLACE)) {
      const destino = m[1];
      // externos, anclas locales y rutas absolutas del sitio web
      if (/^(https?:|mailto:|#|\/)/.test(destino)) continue;
      const [ruta, anclaDestino] = destino.split('#');
      const absoluta = resolve(join(RAIZ, dirname(fichero)), ruta);
      const rel = relative(RAIZ, absoluta).split(sep).join('/');
      if (!existsSync(absoluta)) {
        errores.push(`${fichero}:${i + 1}: enlace roto → ${destino}`);
        continue;
      }
      if (!anclaDestino) continue;
      if (statSync(absoluta).isDirectory()) {
        avisos.push(`${fichero}:${i + 1}: ancla sobre un directorio → ${destino}`);
        continue;
      }
      if (!rel.endsWith('.md')) continue;
      if (!cacheAnclas.has(rel)) cacheAnclas.set(rel, anclasDe(rel));
      if (!cacheAnclas.get(rel).has(anclaDestino)) {
        errores.push(`${fichero}:${i + 1}: ancla inexistente → ${destino}`);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────
console.log(`Preguntas: ${total} · Ficheros markdown: ${ficheros.length}`);
for (const a of avisos) console.log(`⚠️  ${a}`);
if (errores.length) {
  for (const e of errores) console.error(`❌ ${e}`);
  console.error(`\n${errores.length} error(es) de validación.`);
  process.exit(1);
}
console.log(`✅ Validación correcta${avisos.length ? ` (${avisos.length} aviso(s))` : ''}.`);
