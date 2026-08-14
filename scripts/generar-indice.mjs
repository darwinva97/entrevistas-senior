#!/usr/bin/env node
/**
 * Genera INDICE.md: el índice completo y navegable de las preguntas del banco.
 *
 *   node scripts/generar-indice.mjs            escribe INDICE.md
 *   node scripts/generar-indice.mjs --check    solo comprueba que está al día (CI)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, leerBanco, totalArea } from './lib/banco.mjs';

const banco = leerBanco();
const total = banco.reduce((n, a) => n + totalArea(a), 0);
const totalCasos = banco.reduce(
  (n, a) => n + a.ficheros.reduce((m, f) => m + f.preguntas.filter((p) => p.esCaso).length, 0),
  0,
);

const lineas = [];
lineas.push('# 📑 Índice completo del banco de preguntas');
lineas.push('');
lineas.push('> Fichero generado por `scripts/generar-indice.mjs`. **No lo edites a mano:** ejecuta `npm run indice`.');
lineas.push('');
lineas.push(`**${total} preguntas** en ${banco.length} áreas · **${totalCasos}** marcadas como \`[CASO]\` (análisis de problemas).`);
lineas.push('');
lineas.push('¿No sabes por dónde empezar? Los [cursos](cursos/) enseñan lo necesario para responderlas.');
lineas.push('');

// Tabla resumen
lineas.push('| Área | Preguntas | [CASO] |');
lineas.push('|---|:-:|:-:|');
for (const area of banco) {
  const casos = area.ficheros.reduce((m, f) => m + f.preguntas.filter((p) => p.esCaso).length, 0);
  lineas.push(`| ${area.emoji} [${area.titulo}](#${slugArea(area)}) | ${totalArea(area)} | ${casos} |`);
}
lineas.push(`| **Total** | **${total}** | **${totalCasos}** |`);
lineas.push('');
lineas.push('---');
lineas.push('');

for (const area of banco) {
  lineas.push(`## ${area.emoji} ${area.titulo}`);
  lineas.push('');
  lineas.push(`Carpeta: [\`${area.dir}/\`](${area.dir}/) · ${totalArea(area)} preguntas`);
  lineas.push('');
  for (const fichero of area.ficheros) {
    lineas.push(`### ${fichero.titulo}`);
    lineas.push('');
    lineas.push(`[\`${fichero.fichero.split('/').pop()}\`](${fichero.fichero}) · ${fichero.preguntas.length} preguntas`);
    lineas.push('');
    for (const p of fichero.preguntas) {
      const marca = p.esCaso ? ' `[CASO]`' : '';
      const cat = p.categoria ? ` — <sub>${p.categoria}</sub>` : '';
      lineas.push(`${p.numero}. [${escapar(p.titulo)}](${fichero.fichero}#${p.ancla})${marca}${cat}`);
    }
    lineas.push('');
  }
  lineas.push('---');
  lineas.push('');
}

lineas.push('[⬆ Volver al inicio](README.md)');
lineas.push('');

const contenido = lineas.join('\n');
const destino = join(RAIZ, 'INDICE.md');

if (process.argv.includes('--check')) {
  const actual = existsSync(destino) ? readFileSync(destino, 'utf8') : '';
  if (actual !== contenido) {
    console.error('❌ INDICE.md está desactualizado. Ejecuta: npm run indice');
    process.exit(1);
  }
  console.log('✅ INDICE.md está al día.');
} else {
  writeFileSync(destino, contenido);
  console.log(`✅ INDICE.md generado: ${total} preguntas, ${totalCasos} casos.`);
}

function slugArea(area) {
  return `${area.emoji} ${area.titulo}`
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapar(texto) {
  return texto.replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}
