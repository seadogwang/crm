const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf-8');

// 1. Add models array to state
html = html.replace(
  "let S={project:{id:PID,name:'测试'},apis:[],scenarios:[],suites:[],tdata:[],envs:[]};",
  "let S={project:{id:PID,name:'测试'},apis:[],scenarios:[],suites:[],tdata:[],models:[],envs:[]};"
);

// 2. Add selModelId
html = html.replace(
  "let view='auto',sub='scenario',selId=null,stepPid=null,stepCid=null;",
  "let view='auto',sub='scenario',selId=null,selModelId=null,stepPid=null,stepCid=null;"
);

// 3. Init models in load
html = html.replace(
  'if(d)S.tdata=d;if(e)S.envs=e;',
  'if(d)S.tdata=d;if(e)S.envs=e;if(!S.models)S.models=[];'
);

// 4. Add datamodel case in renderContent
html = html.replace(
  "} else if(sub==='tdata'){",
  "} else if(sub==='datamodel'){tabs.innerHTML='';bc.textContent='数据模型';renderModelPage(pg)} else if(sub==='tdata'){"
);

// 5. Add renderModelPage before countSteps
const modelPageFunc = `function renderModelPage(pg){
  document.getElementById('bcCur').textContent='数据模型';
  const models=S.models||[];
  pg.innerHTML=\`<div class="sc-pg">
    <div class="sc-tb"><button class="fb"> 筛选</button><button class="ab" onclick="createModel()">+ 新建数据模型</button></div>
    <table class="dt">
      <thead><tr><th style="width:24px"><input type="checkbox"></th><th>模型名称</th><th>字段数</th><th>描述</th><th style="width:80px">操作</th></tr></thead>
      <tbody>\${models.map(m=>\`<tr onclick="selectModel(\${m.id})"><td class="cb"><input type="checkbox" onclick="event.stopPropagation()"></td><td><span class="sc-nm">\${m.name}</span></td><td style="color:var(--text3)">\${Object.keys(m.schema?.properties||{}).length}</td><td><span class="sc-ds">\${m.description||'-'}</span></td><td><div class="ta2"><button onclick="event.stopPropagation();selectModel(\${m.id})">编辑</button><button class="dn" onclick="event.stopPropagation();delModel(\${m.id})">删除</button></div></td></tr>\`).join('')}\${models.length===0?'<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3)">暂无数据模型</td></tr>':''}</tbody>
    </table>
  </div>\`;
}
function countSteps(s)`;
html = html.replace('function countSteps(s)', modelPageFunc);

// 6. Add model CRUD before // Utils
const modelCRUD = `// Model CRUD
async function createModel(){const n=prompt('模型名称:','NewModel');if(!n)return;const m=await ap('/api/v1/projects/'+PID+'/data-schemas',{name:n,description:'',schema:{type:'object',properties:{}}});if(m){S.models.push(m);renderSidebar();renderContent();showToast('模型已创建')}}
async function delModel(id){if(!confirm('删除？'))return;await ad('/api/v1/projects/'+PID+'/data-schemas/'+id);S.models=(S.models||[]).filter(m=>m.id!==id);selModelId=null;renderSidebar();renderContent();showToast('已删除')}
function selectModel(id){selModelId=id;sub='datamodel';renderSidebar();renderModelDetail(id)}
async function renderModelDetail(id){
  const m=(S.models||[]).find(x=>x.id===id);if(!m)return;
  document.getElementById('bcCur').textContent=m.name;
  const pg=document.getElementById('pgContent');
  const fields=Object.entries(m.schema?.properties||[]);
  const req=m.schema?.required||[];
  pg.innerHTML=\`<div class="tc-d"><div class="tc-m">
    <div class="tc-h"><h2>📦 \${m.name}</h2><div class="tc-ds">\${m.description||'暂无描述'}</div></div>
    <div class="ctabs" style="margin-bottom:12px"><div class="ctab act">字段定义</div><div class="ctab">JSON Schema</div></div>
    <table class="dt" style="background:#fff;border-radius:var(--r2)"><thead><tr><th>字段名</th><th>类型</th><th>必填</th><th>描述</th><th>示例值</th></tr></thead><tbody>
    \${fields.map(([n,f])=>\`<tr><td><code>\${n}</code></td><td><span style="color:var(--primary);font-family:monospace;font-size:11px">\${f.type||'string'}\${f.format?' <'+f.format+'>':''}</span></td><td>\${req.includes(n)?'<span style="color:var(--red);font-size:10px">是</span>':'否'}</td><td style="font-size:11px">\${f.description||'-'}</td><td style="font-size:11px;color:var(--text3);font-family:monospace">\${f.example||'-'}</td></tr>\`).join('')}
    \${fields.length===0?'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text3)">暂无字段</td></tr>':''}
    </tbody></table>
    <div style="margin-top:12px;display:flex;gap:8px"><button class="bs2" style="width:auto;padding:6px 14px" onclick="addField(\${m.id})">+ 添加字段</button><button class="bs2" style="width:auto;padding:6px 14px" onclick="editModelSchema(\${m.id})">✏️ 编辑 Schema</button></div>
    <div style="margin-top:16px"><h4 style="font-size:13px;margin-bottom:8px">完整 JSON Schema</h4><pre style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r);padding:12px;font-size:11px;font-family:monospace;overflow-x:auto">\${JSON.stringify(m.schema,null,2)}</pre></div>
  </div></div>\`;
}
async function addField(id){const m=(S.models||[]).find(x=>x.id===id);if(!m)return;const n=prompt('字段名:');if(!n)return;const t=prompt('类型 (string/number/boolean/object/array):','string')||'string';m.schema.properties=m.schema.properties||{};m.schema.properties[n]={type:t};await au('/api/v1/projects/'+PID+'/data-schemas/'+id,{schema:m.schema});renderModelDetail(id);showToast('字段已添加')}
async function editModelSchema(id){const m=(S.models||[]).find(x=>x.id===id);if(!m)return;const t=prompt('编辑 JSON Schema:',JSON.stringify(m.schema,null,2));if(!t)return;try{m.schema=JSON.parse(t);await au('/api/v1/projects/'+PID+'/data-schemas/'+id,{schema:m.schema});renderModelDetail(id);showToast('Schema 已更新')}catch(e){showToast('JSON 格式错误')}}
// Utils`;
html = html.replace('// Utils', modelCRUD);

fs.writeFileSync('index.html', html);
console.log('Done!');
