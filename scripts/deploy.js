import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🚀 Starting deployment preparation for Hostinger...\n');

// Check if dist directory exists
const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('❌ ERROR: dist directory not found after build!');
  console.log('Please run: npm run build');
  process.exit(1);
}

console.log('✅ dist directory found');

// Create deployment package structure
const deployDir = path.join(rootDir, 'hostinger-deploy');
if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true, force: true });
}
fs.mkdirSync(deployDir, { recursive: true });

console.log('📦 Creating deployment package...');

// Copy dist folder
const deployDistDir = path.join(deployDir, 'dist');
fs.mkdirSync(deployDistDir, { recursive: true });
copyDirectory(distDir, deployDistDir);
console.log('✅ Copied dist folder');

// Copy server.cjs
fs.copyFileSync(path.join(rootDir, 'server.cjs'), path.join(deployDir, 'server.cjs'));
console.log('✅ Copied server.cjs');

// Copy package.json
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(deployDir, 'package.json'));
console.log('✅ Copied package.json');

// Copy package-lock.json
if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
  fs.copyFileSync(path.join(rootDir, 'package-lock.json'), path.join(deployDir, 'package-lock.json'));
  console.log('✅ Copied package-lock.json');
}

// Copy public folder
const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
  try {
    const deployPublicDir = path.join(deployDir, 'public');
    copyDirectory(publicDir, deployPublicDir);
    console.log('✅ Copied public folder');
  } catch (error) {
    console.log('⚠️  Warning: Could not copy public folder (may contain files with special characters)');
    console.log('   This is not critical for deployment');
  }
}

// Create uploads directory
fs.mkdirSync(path.join(deployDir, 'uploads'), { recursive: true });
console.log('✅ Created uploads directory');

// Create .htaccess file
const htaccessContent = `
RewriteEngine On
RewriteBase /

# Redirect HTTP to HTTPS
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Serve React app for all routes except API
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !^/uploads/
RewriteRule ^(.*)$ /dist/index.html [L]

# API routes pass through
RewriteRule ^api/ - [L]
RewriteRule ^uploads/ - [L]
`;
fs.writeFileSync(path.join(deployDir, '.htaccess'), htaccessContent.trim());
console.log('✅ Created .htaccess file');

// Create .env.example file
const envExample = `
PORT=3000
STRIPE_SECRET_KEY=your_stripe_secret_key_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password-or-app-password
SMTP_FROM=your-email@example.com
FIREBASE_SERVICE_ACCOUNT_JSON=
`;
fs.writeFileSync(path.join(deployDir, '.env.example'), envExample.trim());
console.log('✅ Created .env.example file');

// Create README for deployment
const readmeContent = `
# Hostinger Deployment Instructions

## Quick Start

1. Upload all files from this folder to your Hostinger public_html directory
2. SSH into your Hostinger account or use hPanel Terminal
3. Navigate to your directory: cd public_html
4. Install dependencies: npm install --production
5. Set up Node.js in hPanel > Advanced > Node.js
6. Configure environment variables (copy .env.example to .env and edit), including SMTP credentials and Firebase Admin credentials for student selection emails
7. Start the server: node server.cjs

## Files Included

- dist/ - React frontend build
- server.cjs - Backend server
- package.json - Dependencies
- public/ - Static assets
- uploads/ - File storage (empty, will be created automatically)
- .htaccess - Apache configuration
- .env.example - Environment variables template

## Important Notes

- The uploads directory will be created automatically
- The SQLite database (database.sqlite) will be created automatically
- Make sure Node.js is enabled in your Hostinger hPanel
- Set up SSL certificate in hPanel > Domains > SSL

## Troubleshooting

If you see "No output directory found after build":
- Make sure the dist folder exists before uploading
- Run npm run build locally first to verify
- Check that all files were uploaded correctly

For detailed instructions, see HOSTINGER_DEPLOYMENT_GUIDE.md
`;
fs.writeFileSync(path.join(deployDir, 'README.md'), readmeContent.trim());
console.log('✅ Created README.md');

console.log('\n✨ Deployment package created successfully!');
console.log(`📁 Location: ${deployDir}`);
console.log('\n📋 Next steps:');
console.log('1. Upload all files from hostinger-deploy folder to Hostinger');
console.log('2. Follow the README.md instructions on Hostinger');
console.log('3. Or use the detailed HOSTINGER_DEPLOYMENT_GUIDE.md');

function copyDirectory(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
