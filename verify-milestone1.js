const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

console.log('=== Starting Milestone 1 Verification Script ===');

const errors = [];
const warnings = [];

// 1. Check Route Lazy-Loading
function checkRoutes() {
  console.log('\n--- Checking Route Lazy-Loading ---');
  
  const appRoutesPath = path.join(srcDir, 'app', 'app.routes.ts');
  const tabsRoutesPath = path.join(srcDir, 'app', 'tabs', 'tabs.routes.ts');

  if (!fs.existsSync(appRoutesPath)) {
    errors.push(`App routes file not found: ${appRoutesPath}`);
    return;
  }
  if (!fs.existsSync(tabsRoutesPath)) {
    errors.push(`Tabs routes file not found: ${tabsRoutesPath}`);
    return;
  }

  const appRoutesContent = fs.readFileSync(appRoutesPath, 'utf8');
  const tabsRoutesContent = fs.readFileSync(tabsRoutesPath, 'utf8');

  // Verify app routes
  console.log('Checking app.routes.ts...');
  // We expect loadChildren or loadComponent with dynamic import for lazy loading.
  if (appRoutesContent.includes('component:') && !appRoutesContent.includes('loadComponent:')) {
    errors.push('app.routes.ts contains eager components (uses component: instead of loadComponent/loadChildren)');
  } else {
    console.log('✓ app.routes.ts lazy-loading check passed');
  }

  // Verify tabs routes
  console.log('Checking tabs.routes.ts...');
  // Standard Ionic tabs layout is lazy loaded at the app level.
  // The children inside tabs.routes.ts must use loadComponent.
  const childrenMatch = tabsRoutesContent.match(/children:\s*\[([\s\S]*?)\]/);
  if (childrenMatch) {
    const childrenBlock = childrenMatch[1];
    // Check if any route definition in children block does not use loadComponent
    // e.g. path: '...', component: ...
    const lines = childrenBlock.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('component:') && !line.includes('TabsPage')) {
        errors.push(`tabs.routes.ts contains eager child component on line: ${line.trim()}`);
      }
    });
  }
  console.log('✓ tabs.routes.ts lazy-loading check passed');
}

// 2. Check Custom Styles / SCSS Variable Files Exist and Parse
function checkStyles() {
  console.log('\n--- Checking Custom Styles / SCSS Variables ---');
  const styleFiles = [
    'theme/variables.scss',
    'theme/xetu.scss',
    'global.scss'
  ];

  styleFiles.forEach(file => {
    const fullPath = path.join(srcDir, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Style file not found: ${fullPath}`);
      return;
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`Checking ${file}... (${content.length} bytes)`);

    // Basic brace balancing/parsing check
    let openBraces = 0;
    let closeBraces = 0;
    for (let char of content) {
      if (char === '{') openBraces++;
      if (char === '}') closeBraces++;
    }
    if (openBraces !== closeBraces) {
      errors.push(`Mismatched braces in ${file}: open ${openBraces}, close ${closeBraces}`);
    } else {
      console.log(`✓ ${file} basic structural brace check passed`);
    }

    // Try to load sass module if available to parse style file
    try {
      const sass = require('sass');
      console.log(`Attempting to compile ${file} with sass module...`);
      const result = sass.compile(fullPath);
      console.log(`✓ Compiled ${file} successfully with Sass compiler`);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        warnings.push(`Sass module not available in node_modules, skipped full programmatic compilation check for ${file}`);
      } else {
        errors.push(`Sass compilation error in ${file}: ${e.message}`);
      }
    }
  });
}

// 3. Scan for empty / broken source/style files
function checkEmptyOrBrokenFiles() {
  console.log('\n--- Scanning for Empty / Broken Files ---');
  
  function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    files.forEach(file => {
      const fullPath = path.join(currentPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'assets' && file !== 'environments') {
          walkDir(fullPath);
        }
      } else {
        const ext = path.extname(file);
        if (['.ts', '.html', '.scss'].includes(ext)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const trimmed = content.trim();
          
          if (trimmed.length === 0) {
            warnings.push(`Empty file found: ${path.relative(__dirname, fullPath)}`);
          } else {
            // Check for broken patterns (e.g. unreplaced templates, merge conflicts)
            const hasConflictMarker = content
              .split(/\r?\n/)
              .some(line => /^(<<<<<<<|=======|>>>>>>>)($|\s)/.test(line));
            if (hasConflictMarker) {
              errors.push(`Merge conflict markers found in: ${path.relative(__dirname, fullPath)}`);
            }
          }
        }
      }
    });
  }

  walkDir(srcDir);
  console.log('✓ Folder scan completed');
}

checkRoutes();
checkStyles();
checkEmptyOrBrokenFiles();

console.log('\n=== Verification Summary ===');
console.log(`Errors found: ${errors.length}`);
errors.forEach(e => console.error(`[ERROR] ${e}`));

console.log(`Warnings found: ${warnings.length}`);
warnings.forEach(w => console.warn(`[WARN] ${w}`));

if (errors.length > 0) {
  process.exit(1);
} else {
  console.log('Milestone 1 Verification passed successfully!');
  process.exit(0);
}
