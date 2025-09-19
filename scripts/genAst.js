const fs = require('fs');
const path = require('path');

function generateTree(dir, prefix = '', isLast = true, excludeDirs = ['node_modules', 'dist', 'out', '.git','.kiro','.idea','.codebuddy','.vscode','.workflow','assets','resources','docs']) {
  const basename = path.basename(dir);
  
  // 跳过排除的目录和隐藏文件
  if (basename.startsWith('.') && basename !== '.' && basename !== '..' && !['.github', '.workflow'].includes(basename)) {
    return;
  }
  if (excludeDirs.includes(basename)) {
    return;
  }
  
  // 当前项目显示
  if (prefix === '') {
    console.log(`${basename}/`);
  } else {
    const connector = isLast ? '└── ' : '├── ';
    const displayName = fs.statSync(dir).isDirectory() ? `${basename}/` : basename;
    console.log(prefix + connector + displayName);
  }
  
  if (!fs.statSync(dir).isDirectory()) {
    return;
  }
  
  try {
    const items = fs.readdirSync(dir)
      .filter(item => !item.startsWith('.') || ['.github', '.workflow'].includes(item))
      .filter(item => !excludeDirs.includes(item))
      .sort((a, b) => {
        // 目录排在前面，文件排在后面
        const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
        const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });
    
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    
    items.forEach((item, index) => {
      const isLastItem = index === items.length - 1;
      generateTree(path.join(dir, item), newPrefix, isLastItem, excludeDirs);
    });
  } catch (error) {
    console.error(`Error reading directory: ${dir}`, error.message);
  }
}

// 使用示例
const targetDir = process.argv[2] || '.';
console.log('项目文件结构:');
generateTree(targetDir);