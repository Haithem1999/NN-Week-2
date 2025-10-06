/* ---------- GLOBAL STATE ---------- */
let data = [];               // loaded / merged rows
let summary = {};            // JSON summary for export
let categoricalCols = [];    // non-numeric columns
const charts = {};           // Chart.js instances cache

/* ---------- SHORTCUT ---------- */
const $ = id => document.getElementById(id);
const papaCfg = {header:true,dynamicTyping:true,skipEmptyLines:true};

/* ---------- CSV LOADER ---------- */
const loadCSV = file =>
  new Promise((resolve,reject)=>{
    Papa.parse(file,{...papaCfg,complete:r=>resolve(r.data),error:reject});
  });

const setStatus = msg => $('loadStatus').textContent = msg;

/* ---------- BASIC STATS ---------- */
const getNumCols = rows => Object.keys(rows[0]).filter(c=>typeof rows[0][c]==='number');
const getCatCols = rows => Object.keys(rows[0]).filter(c=>typeof rows[0][c]!=='number');

const missingStats = rows => {
  const cols=Object.keys(rows[0]);
  return cols.map(col=>{
    const miss=rows.reduce((a,r)=>(r[col]===''||r[col]==null? a+1:a),0);
    return {col,perc:+(miss/rows.length*100).toFixed(2)};
  });
};

function numericStats(rows){
  const res={}, nums=getNumCols(rows);
  nums.forEach(c=>{
    const vals=rows.map(r=>r[c]).filter(v=>v!=null && !Number.isNaN(v));
    if(!vals.length) return;
    const n=vals.length, mean=vals.reduce((a,b)=>a+b,0)/n;
    const sorted=[...vals].sort((a,b)=>a-b);
    const q=p=>sorted[Math.floor((n-1)*p)];
    const std=Math.sqrt(vals.reduce((s,v)=>s+Math.pow(v-mean,2),0)/n);
    res[c]={count:n,mean:mean.toFixed(2),std:std.toFixed(2),min:sorted[0],
            q1:q(.25),median:q(.5),q3:q(.75),max:sorted[n-1]};
  });
  return res;
}

function categoricalStats(rows, cols){
  const out={}, hasSurv='Survived' in rows[0];
  cols.forEach(c=>{
    const counts={};
    rows.forEach(r=>{
      let key=r[c]??'Missing';
      if(hasSurv) key+=` | Survived:${r.Survived}`;
      counts[key]=(counts[key]||0)+1;
    });
    out[c]=counts;
  });
  return out;
}

/* ---------- CHART HELPERS ---------- */
const destroyChart = id => charts[id] && (charts[id].destroy(), delete charts[id]);

function drawChart(id,type,labels,dataArr,xTitle,yTitle){
  destroyChart(id);
  charts[id]=new Chart($(id).getContext('2d'),{
    type,
    data:{labels,datasets:[{label:yTitle,data:dataArr,backgroundColor:'rgba(0,123,255,.6)'}]},
    options:{
      responsive:true,
      plugins:{legend:{display:false}},
      scales:{
        x:{title:{display:true,text:xTitle}},
        y:{title:{display:true,text:yTitle},beginAtZero:true}
      }
    }
  });
}

function drawHistogram(col,canvasId){
  if(!data.length || !data[0][col]) return;
  const vals=data.map(r=>r[col]).filter(v=>v!=null && !Number.isNaN(v));
  if(!vals.length) return;
  const n=vals.length, k=n<50?5:Math.ceil(Math.log2(n)+1);
  const min=Math.min(...vals), max=Math.max(...vals), bw=(max-min)/k, bins=new Array(k).fill(0);
  vals.forEach(v=>bins[Math.min(Math.floor((v-min)/bw),k-1)]++);
  const labels=bins.map((_,i)=>`${(min+bw*i).toFixed(1)}–${(min+bw*(i+1)).toFixed(1)}`);
  drawChart(canvasId,'bar',labels,bins,col,'Count');
}

/* ---------- TABLE RENDER ---------- */
function renderPreview(rows, mode){
  if(!rows.length){$('previewTable').innerHTML='';return;}
  let slice;
  switch(mode){
    case '10': slice=rows.slice(0,10);break;
    case '20': slice=rows.slice(0,20);break;
    case 'head': slice=rows.slice(0,50);break;
    case 'tail': slice=rows.slice(-50);break;
    case 'all': slice=rows;break;
    default: slice=rows.slice(0,5);
  }
  const cols=Object.keys(rows[0]);
  const scrollAttr = mode==='all' ? ' id="allDataContainer"' : '';
  let html=`<div class="table-responsive"${scrollAttr}><table class="table table-sm table-striped"><thead><tr>`;
  html+=cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';
  slice.forEach(r=>{html+='<tr>'+cols.map(c=>`<td>${r[c]}</td>`).join('')+'</tr>';});
  $('previewTable').innerHTML=html+'</tbody></table></div>';
}

function renderNumericTable(obj){
  const entries=Object.entries(obj);
  if(!entries.length){$('numericStats').innerHTML='';return;}
  let html='<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Col</th><th>N</th><th>Mean</th><th>Std</th><th>Min</th><th>Q1</th><th>Med</th><th>Q3</th><th>Max</th></tr></thead><tbody>';
  entries.forEach(([c,s])=>{
    html+=`<tr><td>${c}</td><td>${s.count}</td><td>${s.mean}</td><td>${s.std}</td><td>${s.min}</td><td>${s.q1}</td><td>${s.median}</td><td>${s.q3}</td><td>${s.max}</td></tr>`;
  });
  $('numericStats').innerHTML=html+'</tbody></table></div>';
}

function renderCategoricalTables(obj){
  let html='';
  Object.entries(obj).forEach(([col,counts])=>{
    html+=`<h6 class="mt-3">${col}</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>`;
    Object.entries(counts).forEach(([k,v])=>{html+=`<tr><td>${k}</td><td>${v}</td></tr>`;});
    html+='</tbody></table></div>';
  });
  $('categoricalStats').innerHTML=html;
}

/* ---------- EXPORT ---------- */
const download = (name,content,type) => {
  const blob=new Blob([content],{type});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
};

/* ---------- BUTTON HANDLERS ---------- */
$('loadBtn').onclick = async () => {
  const file=$('csvInput').files[0];
  if(!file){alert('Choose a CSV');return;}
  setStatus('Loading …');
  data=await loadCSV(file);
  setStatus('Loaded ✔');
  $('mergeSection').classList.remove('d-none');

  $('shapeInfo').innerHTML=`Rows: <b>${data.length}</b> | Cols: <b>${Object.keys(data[0]).length}</b>`;
  renderPreview(data,'5'); $('previewSelect').value='5';

  categoricalCols=getCatCols(data);
  $('catSelect').innerHTML=categoricalCols.map(c=>`<option>${c}</option>`).join('');

  const miss=missingStats(data);
  drawChart('missingChart','bar',miss.map(m=>m.col),miss.map(m=>m.perc),'Column','% Missing');

  const num=numericStats(data); renderNumericTable(num);
  summary={numeric:num,missing:miss};

  const countBy=k=>data.reduce((acc,r)=>(r[k]&&(acc[r[k]]=(acc[r[k]]||0)+1),acc),{});
  if('Sex' in data[0])    {const s=countBy('Sex');    drawChart('sexChart','bar',Object.keys(s),Object.values(s),'Sex','Count');}
  if('Pclass' in data[0]) {const p=countBy('Pclass'); drawChart('pclassChart','bar',Object.keys(p),Object.values(p),'Pclass','Count');}
  if('Embarked' in data[0]){const e=countBy('Embarked');drawChart('embChart','bar',Object.keys(e),Object.values(e),'Embarked','Count');}

  drawHistogram('Age','ageHist');
  drawHistogram('Fare','fareHist');
};

$('mergeBtn').onclick = async () => {
  if(!data.length){alert('Load a base CSV first');return;}
  const file=$('csvInput2').files[0];
  if(!file){alert('Choose a second CSV');return;}
  const addSrc=$('addSource').checked;
  const extra=await loadCSV(file);
  if(addSrc){
    extra.forEach(r=>r.Source=file.name);
    data.forEach(r=>{if(!r.Source) r.Source=$('csvInput').files[0].name;});
  }
  data=[...data,...extra];
  setStatus(`Merged ✔ – ${data.length} rows`);
  $('shapeInfo').innerHTML=`Rows: <b>${data.length}</b> | Cols: <b>${Object.keys(data[0]).length}</b>`;
  renderPreview(data,'5');
  categoricalCols=getCatCols(data);
  $('catSelect').innerHTML=categoricalCols.map(c=>`<option>${c}</option>`).join('');
};

$('previewSelect').onchange = e => renderPreview(data,e.target.value);

$('catBtn').onclick = () => {
  const cols=[...$('catSelect').selectedOptions].map(o=>o.value);
  if(!cols.length){alert('Choose categorical columns');return;}
  const cat=categoricalStats(data,cols); renderCategoricalTables(cat);
  summary.categorical=cat;
};

$('exportBtn').onclick      = () => data.length ? download('merged.csv',Papa.unparse(data),'text/csv')                           : alert('No data to export');
$('exportJSONBtn').onclick  = () => Object.keys(summary).length ? download('summary.json',JSON.stringify(summary,null,2),'application/json') : alert('Run analysis first');
