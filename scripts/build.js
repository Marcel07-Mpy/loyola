/**
 * Script utilitaire build. Automatise une opération de maintenance ou de préparation du projet.
 */
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const runtimeEntries = [
  'server.js',
  'assets',
  'config',
  'controllers',
  'middleware',
  'models',
  'routes',
  'services',
  'utils',
];

async function collectJavaScriptFiles(entryPath) {
  const stats = await import('node:fs/promises').then(({ stat }) => stat(entryPath));
  if (stats.isFile()) return entryPath.endsWith('.js') ? [entryPath] : [];

  const entries = await readdir(entryPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectJavaScriptFiles(path.join(entryPath, entry.name))),
  );
  return nested.flat();
}

async function main() {
  const sourcePaths = runtimeEntries.map((entry) => path.join(root, entry));
  const jsFiles = (await Promise.all(sourcePaths.map(collectJavaScriptFiles))).flat();

  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || `Erreur de syntaxe dans ${file}\n`);
      process.exit(result.status || 1);
    }
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const entry of runtimeEntries) {
    await cp(path.join(root, entry), path.join(distDir, entry), {
      recursive: true,
    });
  }

  console.log(`Build backend terminé : ${path.relative(root, distDir)}`);
  console.log(`${jsFiles.length} fichiers JavaScript vérifiés.`);
}

main().catch((error) => {
  console.error('Échec du build backend :', error.message);
  process.exit(1);
});
