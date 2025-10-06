/* ---------- GLOBAL STATE ---------- */
let data = [];           // main dataset
let summary = {};        // JSON summary
let categoricalCols = []; // non-numeric columns for user selection
const ctxCache = {};     // store Chart instances to allow re-render

/* ---------- HELPER FUNCTIONS ---------- */
const $ = id => document.getElementById(id);

const papaCfg = {header:true,dynamicTyping:true,skipEmptyLines:true};

function loadCSV(file){
  return new Promise((res,rej)=>{
    Papa.parse(file,{...papaCfg,complete:r=>res(r.data),error:e=>rej(e)});
  });
}

function showStatus(msg){ $('loadStatus').textContent = msg; }

function calcMissing(arr){
  const cols = Object.keys(arr[0]);
  return cols.map(c=>{
    const missing = arr.reduce((acc,row)=>(!row[c] && row[c]!==0 ? acc+1 : acc),0);
    return {col:c, perc:+((missing/arr.length)*100).toFixed(2)};
  });
}

function numericCols(arr){
  const sample = arr[0];
  return Object.keys(sample).filter(k=>typeof sample[k]==='number');
}

function nonNumericCols(arr){
  const sample = arr[0];
  return Object.keys(sample).filter(k=>typeof sample[k]!=='number');
}

function numericStats(arr){
  const nums = numericCols(arr);
  const out = {};
  nums.forEach(col=>{
    const vals = arr.map(r=>r[col]).filter(v=>v!==null && !Number.isNaN(v));
    const n = vals.length; if(!n){return;}
    const mean = vals.reduce((a,b)=>a+b,0)/n;
    const sorted = [...vals].sort((a,b)=>a-b);
    const q = p => sorted[Math.floor((n-1)*p)];
    const std = Math.sqrt(vals.reduce((s,v)=>(s+Math.pow(v-mean,2)),0)/n);
    out[col] = {count:n,mean:mean.toFixed(2),std:std.toFixed(2),min:sorted[0],q1:q(.25),median:q(.5),q3:q(.75),max:sorted[n-1]};
  });
  return out;
}

function categoricalStats(arr, cols){
  const out = {};
  const survivedExists = arr[0].hasOwnProperty('Survived');
  cols.forEach(col=>{
    const counts = {};
    arr.forEach(r=>{
      let key = r[col]??'Missing';
      if(survivedExists) key = `${key} | Survived:${r.Survived}`;
      counts[key] = (counts[key]||0)+1;
    });
    out[col] = counts;
  });
  return out;
}

function downloadFile(name,content,type){
  const blob = new Blob([content],{type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}

function destroyChart(id){
  if(ctxCache[id]){ ctxCache[id].destroy(); delete ctxCache[id]; }
}

function renderChart(id,type,labels,dataset,label,xTitle,yTitle){
  destroyChart(id);
  const ctx = $(id).getContext('2d');
  ctxCache[id] = new Chart(ctx,{
    type,
    data:{labels,datasets:[{label,data:dataset,backgroundColor:'rgba(0,123,255,.6)'}]},
    options:{
      responsive:true,
      scales:{
        x:{title:{display:true,text:xTitle}},
        y:{title:{display:true,text:yTitle},beginAtZero:true}
      },
      plugins:{legend:{display:false}}
    }
  });
}

/* ---------- UI RENDERERS ---------- */
function shapeInfo(arr){
  $('shapeInfo').innerHTML = `Rows: <b>${arr.length}</b> | Columns: <b>${Object.keys(arr[0]).length}</b>`;
}

function makeTable(arr,limit,fromTail=false){
  const cols = Object.keys(arr[0]);
  let rows = arr;
  if(limit!=='all'){
    if(fromTail) rows = arr.slice(-limit);
    else rows = arr.slice(0,limit);
  }
  let html = `<div class="table-responsive${limit==='all'?'":" id="allDataContainer"'}"><table class="table table-sm table-striped"><thead><tr>`;
  html += cols.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  rows.forEach(r=>{
    html += '<tr>'+cols.map(c=>`<td>${r[c]}</td>`).join('')+'</tr>';
  });
  html += '</tbody></table></div>';
  $('previewTable').innerHTML = html;
}

function numericStatsTable(obj){
  const cols = Object.keys(obj);
  let html='<div class="table-responsive"><table class="table table-sm table-striped"><thead><tr><th>Column</th><th>Count</th><th>Mean</th><th>Std</th><th>Min</th><th>25%</th><th>50%</th><th>75%</th><th>Max</th></tr></thead><tbody>';
  cols.forEach(c=>{
    const s=obj[c]; html+=`<tr><td>${c}</td><td>${s.count}</td><td>${s.mean}</td><td>${s.std}</td><td>${s.min}</td><td>${s.q1}</td><td>${s.median}</td><td>${s.q3}</td><td>${s.max}</td></tr>`;
  });
  html+='</tbody></table></div>';
  $('numericStats').innerHTML = html;
}

function categoricalStatsTables(obj){
  let html='';
  Object.entries(obj).forEach(([col,counts])=>{
    html += `<h6 class="mt-3">${col}</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>`;
    Object.entries(counts).forEach(([k,v])=>{ html+=`<tr><td>${k}</td><td>${v}</td></tr>`; });
    html+='</tbody></table></div>';
  });
  $('categoricalStats').innerHTML = html;
}

/* ---------- MAIN WORKFLOW ---------- */
$('loadBtn').addEventListener('click',async()=>{
  const file = $('csvInput').files[0];
  if(!file){alert('Select a CSV first');return;}
  showStatus('Loading…');
  data = await loadCSV(file);
  showStatus('Loaded ✔');
  $('mergeSection').classList.remove('d-none');
  // populate preview + stats
  shapeInfo(data);
  makeTable(data,5,false);
  $('previewSelect').value='5';
  // populate categorical select
  categoricalCols = nonNumericCols(data);
  $('catSelect').innerHTML = categoricalCols.map(c=>`<option value="${c}">${c}</option>`).join('');
  // missing chart
  const miss = calcMissing(data);
  renderChart('missingChart','bar',miss.map(m=>m.col),miss.map(m=>m.perc),'Missing %','Column','% Missing');
  // numeric stats
  const nStats = numericStats(data);
  numericStatsTable(nStats);
  summary.numeric = nStats;
  summary.missing = miss;
  // default charts (if cols exist)
  const sexCounts={},pclassCounts={},embCounts={};
  data.forEach(r=>{
    if(r.Sex) sexCounts[r.Sex]=(sexCounts[r.Sex]||0)+1;
    if(r.Pclass) pclassCounts[r.Pclass]=(pclassCounts[r.Pclass]||0)+1;
    if(r.Embarked) embCounts[r.Embarked]=(embCounts[r.Embarked]||0)+1;
  });
  if(Object.keys(sexCounts).length)
    renderChart('sexChart','bar',Object.keys(sexCounts),Object.values(sexCounts),'Sex','Sex','Count');
  if(Object.keys(pclassCounts).length)
    renderChart('pclassChart','bar',Object.keys(pclassCounts),Object.values(pclassCounts),'Pclass','Pclass','Count');
  if(Object.keys(embCounts).length)
    renderChart('embChart','bar',Object.keys(embCounts),Object.values(embCounts),'Embarked','Embarked','Count');
  if(data[0].Age){
    const ages=data.map(r=>r.Age).filter(v=>v!==null&&!Number.isNaN(v));
    buildHistogram(ages,'ageHist','Age');
  }
  if(data[0].Fare){
    const fares=data.map(r=>r.Fare).filter(v=>v!==null&&!Number.isNaN(v));
    buildHistogram(fares,'fareHist','Fare');
  }
});

$('mergeBtn').addEventListener('click',async()=>{
  if(!data.length){alert('Load a base CSV first');return;}
  const file2=$('csvInput2').files[0];
  if(!file2){alert('Select a second CSV');return;}
  const addSource=$('addSource').checked;
  const newData=await loadCSV(file2);
  if(addSource){
    newData.forEach(r=>r.Source=file2.name);
    data.forEach(r=>{if(!r.Source) r.Source=$('csvInput').files[0].name;});
  }
  data=[...data,...newData];
  showStatus('Merged ✔ — dataset now '+data.length+' rows.');
  // rerun preview & stats quickly
  shapeInfo(data); makeTable(data,5,false);
  categoricalCols = nonNumericCols(data);
  $('catSelect').innerHTML = categoricalCols.map(c=>`<option value="${c}">${c}</option>`).join('');
});

$('previewSelect').addEventListener('change',e=>{
  const val=e.target.value;
  if(val==='head'){ makeTable(data,10,false);}
  else if(val==='tail'){ makeTable(data,10,true);}
  else if(val==='all'){ makeTable(data,'all',false);}
  else{ makeTable(data,Number(val),false);}
});

$('catBtn').addEventListener('click',()=>{
  const sel=[...$('catSelect').selectedOptions].map(o=>o.value);
  if(!sel.length){alert('Select one or more categorical columns');return;}
  const cStats=categoricalStats(data,sel);
  categoricalStatsTables(cStats);
  summary.categorical=cStats;
});

function buildHistogram(arr,canvasId,label){
  if(!arr.length) return;
  const n=arr.length,k=n<50?5:Math.ceil(Math.log2(n)+1);
  const min=Math.min(...arr),max=Math.max(...arr);
  const bw=(max-min)/k; const bins=new Array(k).fill(0);
  arr.forEach(v=>{bins[Math.min(Math.floor((v-min)/bw),k-1)]++;});
  const labels=bins.map((_,i)=>`${(min+bw*i).toFixed(1)}-${(min+bw*(i+1)).toFixed(1)}`);
  renderChart(canvasId,'bar',labels,bins,label,label,'Count');
}

$('exportBtn').addEventListener('click',()=>{
  if(!data.length){alert('Nothing to export');return;}
  downloadFile('merged.csv',Papa.unparse(data),'text/csv');
});

$('exportJSONBtn').addEventListener('click',()=>{
  if(Object.keys(summary).length===0){alert('Run some analysis first');return;}
  downloadFile('summary.json',JSON.stringify(summary,null,2),'application/json');
});
