#!/usr/bin/env node
// 每次要推新版前，跑一下這支腳本：node scripts/bump-sw-version.js
// 它會自動把 sw.js 裡的 _swBuild 換成「現在時間」，不用再手動改數字、
// 也不會忘記改（忘記改的話瀏覽器會一直吃舊快取，新功能不會生效）。

const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'sw.js');
let content = fs.readFileSync(swPath, 'utf8');

// 用現在時間產生版本號，格式跟原本手動打的一樣：YYYYMMDDHHmm
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const build =
  now.getFullYear() +
  pad(now.getMonth() + 1) +
  pad(now.getDate()) +
  pad(now.getHours()) +
  pad(now.getMinutes());

const before = content;
content = content.replace(
  /const _swBuild = '[^']*';/,
  `const _swBuild = '${build}';`
);

if (content === before) {
  console.error('❌ 沒找到 _swBuild 那一行，請確認 sw.js 格式沒被改掉');
  process.exit(1);
}

fs.writeFileSync(swPath, content);
console.log(`✅ sw.js 版本號已更新為 ${build}`);

// 帳號頁顯示的版本號（index.html 的 window._BUILD）用同一個時間，兩邊永遠一致
const idxPath = path.join(__dirname, '..', 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
const display = build.slice(0, 8) + '-' + build.slice(8);
const idxNew = idx.replace(/window\._BUILD="[^"]*";/, `window._BUILD="${display}";`);
if (idxNew === idx && !idx.includes(`window._BUILD="${display}"`)) {
  console.error('❌ 沒找到 index.html 裡的 window._BUILD，請確認格式沒被改掉');
  process.exit(1);
}
fs.writeFileSync(idxPath, idxNew);
console.log(`✅ index.html 版本號已更新為 ${display}`);
