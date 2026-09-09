const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query('CREATE TABLE IF NOT EXISTS records (id SERIAL PRIMARY KEY, ts TEXT, customer TEXT, vehicle TEXT, mileage TEXT, activation TEXT, activation_raw TEXT, expiry TEXT, warranty TEXT, warranty_months TEXT, status TEXT, status_value TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
}

function rowToRecord(row) {
  return { id: row.id, ts: row.ts, customer: row.customer, vehicle: row.vehicle, mileage: row.mileage, activation: row.activation, activationRaw: row.activation_raw, expiry: row.expiry, warranty: row.warranty, warrantyMonths: row.warranty_months, status: row.status, statusValue: row.status_value };
}

const recordsDbPatchScript = '<script>' +
'(function(){' +
'var RECORDS_KEY="weide_warranty_records",MIGRATION_KEY="weide_warranty_records_migrated_to_db",recordsCache=[];' +
'function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\\"/g,"&quot;").replace(/\\\'/g,"&#39;");}' +
'function key(r){return [r.ts,r.customer,r.vehicle,r.activation,r.expiry,r.warranty,r.status].join("|");}' +
'function localRecords(){try{var raw=localStorage.getItem(RECORDS_KEY);return raw?JSON.parse(raw):[]}catch(e){return[]}}' +
'function migrated(){try{localStorage.setItem(MIGRATION_KEY,"1")}catch(e){}}' +
'async function api(url,opt){var res=await fetch(url,opt||{});var data=await res.json().catch(function(){return{}});if(!res.ok)throw new Error(data.error||"数据库请求失败");return data;}' +
'async function migrate(existing){try{if(localStorage.getItem(MIGRATION_KEY)==="1")return existing}catch(e){return existing}var old=localRecords();if(!old.length){migrated();return existing}var seen={};existing.forEach(function(r){seen[key(r)]=true});var upload=[];for(var i=old.length-1;i>=0;i--){var r=old[i],k=key(r);if(!seen[k]){upload.push(r);seen[k]=true}}for(var j=0;j<upload.length;j++){await api("/api/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(upload[j])})}migrated();return api("/api/records");}' +
'async function load(){var existing=await api("/api/records");recordsCache=await migrate(existing);return recordsCache;}' +
'function msg(m){var w=document.getElementById("records-table-wrap");if(w)w.innerHTML="<div class=\\"no-records\\">"+esc(m)+"</div>"}' +
'async function refresh(){msg("正在读取数据库记录...");try{await load();renderRecords()}catch(e){msg("数据库记录暂时无法读取，请稍后刷新页面。")}}' +
'window.saveRecord=async function(){var r={customer:document.getElementById("in-customer").value||"-",vehicle:document.getElementById("in-vehicle").value||"-",mileage:document.getElementById("in-mileage").value||"-",activation:document.getElementById("f-activation").textContent,activationRaw:document.getElementById("in-activation").value||"",expiry:document.getElementById("f-expiry").textContent,warranty:document.getElementById("f-warranty").textContent,warrantyMonths:document.querySelector("input[name=\\"warranty\\"]:checked").value,status:document.getElementById("status-text").textContent,statusValue:document.querySelector("input[name=\\"status\\"]:checked").value};try{await api("/api/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(r)});await refresh()}catch(e){alert("保存到数据库失败："+e.message)}};' +
'window.loadRecordIntoForm=function(i){var r=recordsCache[i];if(!r)return;document.getElementById("in-customer").value=r.customer==="-"?"":r.customer;updateField("customer",document.getElementById("in-customer").value);document.getElementById("in-vehicle").value=r.vehicle==="-"?"":r.vehicle;updateField("vehicle",document.getElementById("in-vehicle").value);var m=(r.mileage||"").replace(/[^0-9]/g,"");document.getElementById("in-mileage").value=m;updateField("mileage",m);document.getElementById("in-activation").value=r.activationRaw||"";if(r.warrantyMonths){var wr=document.querySelector("input[name=\\"warranty\\"][value=\\""+r.warrantyMonths+"\\"]");if(wr)wr.checked=true}if(r.statusValue){var sr=document.querySelector("input[name=\\"status\\"][value=\\""+r.statusValue+"\\"]");if(sr)sr.checked=true;updateStatus()}recalc();window.scrollTo({top:0,behavior:"smooth"})};' +
'window.deleteRecord=async function(i){var r=recordsCache[i];if(!r||!r.id)return;try{await api("/api/records/"+encodeURIComponent(r.id),{method:"DELETE"});await refresh()}catch(e){alert("删除数据库记录失败："+e.message)}};' +
'window.clearAllRecords=async function(){if(!confirm("确定要清空全部数据库历史记录吗？此操作无法撤销。"))return;try{await api("/api/records",{method:"DELETE"});try{localStorage.removeItem(RECORDS_KEY)}catch(e){}recordsCache=[];renderRecords()}catch(e){alert("清空数据库记录失败："+e.message)}};' +
'window.renderRecords=function(){var list=recordsCache,w=document.getElementById("records-table-wrap");if(!w)return;if(list.length===0){w.innerHTML="<div class=\\"no-records\\">暂无记录</div>";return}var html="<table class=\\"records-table\\"><thead><tr><th>保存时间</th><th>顾客</th><th>Vehicle No.</th><th>生效日期</th><th>过期日期</th><th>保修期限</th><th>状态</th><th></th></tr></thead><tbody>";list.forEach(function(r,i){html+="<tr><td>"+esc(r.ts)+"</td><td>"+esc(r.customer)+"</td><td>"+esc(r.vehicle)+"</td><td>"+esc(r.activation)+"</td><td>"+esc(r.expiry)+"</td><td>"+esc(r.warranty)+"</td><td>"+esc(r.status)+"</td><td><span class=\\"record-del\\" style=\\"color:#2A6BC2;\\" onclick=\\"loadRecordIntoForm("+i+")\\">编辑/重新导出</span> &middot; <span class=\\"record-del\\" onclick=\\"deleteRecord("+i+")\\">删除</span></td></tr>"});html+="</tbody></table>";w.innerHTML=html};' +
'var h=document.querySelector(".records-panel .records-hint");if(h)h.innerHTML="记录会保存到 Railway 数据库，可在不同设备/浏览器同步查看。首次打开会自动把当前浏览器旧记录迁移到数据库；点“编辑/重新导出”会把该条资料重新载入上方表单，你可以修改后再次导出图片或打印/存PDF。";' +
'refresh();' +
'})();' +
'</' + 'script>';

function sendIndex(req, res) {
  fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).send('Unable to load page');
    res.type('html').send(html.replace('</body>', recordsDbPatchScript + '\n</body>'));
  });
}

app.get(['/', '/index.html'], sendIndex);

app.get('/api/records', async (req, res) => {
  try { const { rows } = await pool.query('SELECT * FROM records ORDER BY created_at DESC'); res.json(rows.map(rowToRecord)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/records', async (req, res) => {
  try {
    const r = req.body || {};
    const ts = r.ts || new Date().toLocaleString('zh-CN', { hour12: false });
    const { rows } = await pool.query('INSERT INTO records (ts, customer, vehicle, mileage, activation, activation_raw, expiry, warranty, warranty_months, status, status_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [ts, r.customer, r.vehicle, r.mileage, r.activation, r.activationRaw, r.expiry, r.warranty, r.warrantyMonths, r.status, r.statusValue]);
    res.json(rowToRecord(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/records/:id', async (req, res) => {
  try { await pool.query('DELETE FROM records WHERE id = $1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/records', async (req, res) => {
  try { await pool.query('DELETE FROM records'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(__dirname, { index: false }));
app.get('*', sendIndex);

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => { app.listen(PORT, () => console.log('Server listening on port ' + PORT)); })
  .catch((err) => { console.error('Failed to initialize database', err); process.exit(1); });

