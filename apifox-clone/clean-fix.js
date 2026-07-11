const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf-8');

// Find the script section
const scriptMatch = html.match(/(<script>)([\s\S]*?)(<\/script>)/);
if (!scriptMatch) { console.log('No script found'); process.exit(1); }

let js = scriptMatch[2];

// Check for obvious syntax errors - find unmatched quotes
let errors = [];

// Simple check: count quotes in problematic areas
const lines = js.split('\n');
lines.forEach((line, i) => {
  if (line.includes('datamodel') || line.includes('switchSub') || line.includes('selectModel')) {
    // Count single and double quotes
    const singles = (line.match(/'/g) || []).length;
    const doubles = (line.match(/"/g) || []).length;
    if (singles % 2 !== 0 || doubles % 2 !== 0) {
      errors.push(`Line ${i+1}: unmatched quotes - ${line.trim().substring(0,100)}`);
    }
  }
});

if (errors.length > 0) {
  console.log('Found quote errors:');
  errors.forEach(e => console.log('  ' + e));
} else {
  console.log('No obvious quote errors found');
}

// Let's just replace the entire sidebar rendering function with a clean version
// First, find where renderSidebar starts and ends
const rsStart = js.indexOf('function renderSidebar(){');
const rsEnd = js.indexOf('\nfunction renderContent(){');

if (rsStart === -1 || rsEnd === -1) {
  console.log('Could not find renderSidebar boundaries');
  process.exit(1);
}

const newRenderSidebar = `function renderSidebar(){
  const tree=document.getElementById('sbTree');
  const q=(document.getElementById('sbSearch').value||'').toLowerCase();
  let h='';
  if(view==='api'){
    h+='<div class="ti act"><span class="arr open">▶</span><span class="ico"></span><span class="lbl">默认模块</span></div>';
    h+='<div class="tc"><div class="ti"><span class="arr" style="visibility:hidden">▶</span><span class="ico">📁</span><span class="lbl">接口根目录</span></div>';
    h+='<div class="tc">';
    for(const a of S.apis){
      if(q&&!a.name.toLowerCase().includes(q))continue;
      h+='<div class="ti" onclick="selectApi('+a.id+')"><span class="arr" style="visibility:hidden">▶</span><span class="ico"><span style="font-size:9px;padding:0 2px;border-radius:2px;background:'+((a.method||'GET')==='GET'?'var(--green)':'var(--blue'))+';color:#fff;font-weight:600">'+(a.method||'GET')+'</span></span><span class="lbl">'+hl(a.name,q)+'</span></div>';
    }
    h+='</div></div>';
    h+='<div class="td"></div>';
    h+='<div class="ti'+(sub==='datamodel'?' act':'')+'" onclick="switchSub(\'datamodel\')"><span class="arr'+(sub==='datamodel'?' open':'')+'">▶</span><span class="ico">📦</span><span class="lbl">数据模型</span></div>';
    if(sub==='datamodel'){
      h+='<div class="tc">';
      for(const m of (S.models||[])) h+='<div class="ti'+(selModelId===m.id?' act':'')+'" onclick="selectModel('+m.id+')"><span class="arr" style="visibility:hidden">▶</span><span class="ico">📋</span><span class="lbl">'+m.name+'</span></div>';
      h+='<div class="ta" onclick="createModel()">+ 新增</div></div>';
    }
    h+='<div class="ti"><span class="arr">▶</span><span class="ico">🧩</span><span class="lbl">组件库</span></div>';
    h+='<div class="ti"><span class="arr">▶</span><span class="ico">⚡</span><span class="lbl">快捷请求</span></div>';
    h+='<div class="ta" onclick="createApi()">+ 新建接口</div>';
  } else if(view==='auto'){
    h+='<div class="ti'+(sub==='single'?' act':'')+'" onclick="switchSub(\'single\')"><span class="arr open">▶</span><span class="ico">🔌</span><span class="lbl">单接口用例</span></div>';
    h+='<div class="tc"><div class="ti"><span class="arr" style="visibility:hidden">▶</span><span class="ico">📁</span><span class="lbl">默认模块</span></div></div>';
    h+='<div class="ti'+(sub==='scenario'?' act':'')+'" onclick="switchSub(\'scenario\')"><span class="arr open">▶</span><span class="ico">📋</span><span class="lbl">场景用例</span></div>';
    h+='<div class="tc">';
    h+='<div class="ti"><span class="arr" style="visibility:hidden">▶</span><span class="ico">📁</span><span class="lbl">场景用例根目录</span></div>';
    for(const sc of S.scenarios){
      if(q&&!sc.name.toLowerCase().includes(q))continue;
      h+='<div class="ti'+(selId===sc.id?' act':'')+'" onclick="selectSc('+sc.id+')"><span class="arr" style="visibility:hidden">▶</span><span class="ico">📝</span><span class="lbl">'+hl(sc.name,q)+'</span></div>';
    }
    h+='<div class="ta" onclick="createSc()">+ 新增</div></div>';
    h+='<div class="ti" onclick="switchSub(\'suite\')"><span class="arr">▶</span><span class="ico">📦</span><span class="lbl">测试套件</span></div>';
    h+='<div class="tc" style="display:none">';
    for(const s of S.suites) h+='<div class="ti"><span class="arr" style="visibility:hidden">▶</span><span class="ico"></span><span class="lbl">'+s.name+'</span></div>';
    h+='<div class="ta" onclick="createSuite()">+ 新增</div></div>';
    h+='<div class="ti" onclick="switchSub(\'tdata\')"><span class="arr">▶</span><span class="ico">💾</span><span class="lbl">测试数据</span></div>';
    h+='<div class="tc" style="display:none"><div class="ta" onclick="createTData()">+ 新增</div></div>';
    h+='<div class="ti"><span class="arr">▶</span><span class="ico">⏰</span><span class="lbl">定时任务</span></div>';
    h+='<div class="ti"><span class="arr">▶</span><span class="ico">📊</span><span class="lbl">测试报告</span></div>';
    h+='<div class="td"></div>';
    h+='<div class="ti'+(sub==='datamodel'?' act':'')+'" onclick="switchSub(\'datamodel\')"><span class="arr'+(sub==='datamodel'?' open':'')+'">▶</span><span class="ico">📦</span><span class="lbl">数据模型</span></div>';
  } else {
    h+='<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">功能开发中</div>';
  }
  tree.innerHTML=h;
}`;

// Replace the renderSidebar function
js = js.substring(0, rsStart) + newRenderSidebar + js.substring(rsEnd);

// Also fix the renderContent datamodel case
js = js.replace(
  /} else if\(sub==='tdata'\)\{/,
  "} else if(sub==='datamodel'){tabs.innerHTML='';bc.textContent='数据模型';renderModelPage(pg)} else if(sub==='tdata'){"
);

html = html.replace(scriptMatch[0], '<script>' + js + '</script>');
fs.writeFileSync('index.html', html);
console.log('Done - cleaned up renderSidebar');
