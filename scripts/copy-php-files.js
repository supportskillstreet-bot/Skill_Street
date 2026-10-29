import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

// Files/folders to copy to dist/
const itemsToCopy = [
  { source: 'api', dest: 'api' },
  { source: '.htaccess', dest: '.htaccess' },
];

// Create directories and copy files
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${src} → ${dest}`);
  } else {
    console.warn(`Warning: ${src} does not exist`);
  }
}

console.log('Copying PHP backend files to dist/...');

// Copy directories
itemsToCopy.forEach(item => {
  const srcPath = path.join(projectRoot, item.source);
  const destPath = path.join(distDir, item.dest);

  if (fs.existsSync(srcPath)) {
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
      console.log(`Copied directory: ${item.source}/ → dist/${item.dest}/`);
    } else {
      copyFile(srcPath, destPath);
    }
  } else {
    console.warn(`Warning: ${item.source} does not exist`);
  }
});

const uploadsSource = path.join(projectRoot, 'uploads', '.htaccess');
const uploadsDestination = path.join(distDir, 'uploads');
fs.mkdirSync(uploadsDestination, { recursive: true });
if (fs.existsSync(uploadsSource)) {
  fs.copyFileSync(uploadsSource, path.join(uploadsDestination, '.htaccess'));
}

console.log('✓ PHP backend files copied to dist/');
