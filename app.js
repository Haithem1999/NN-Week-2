// === Global state ===
let trainData = [], testData = [], merged = [], summaryJSON = {};

const el = id => document.getElementById(id);

// === Helpers ===
function loadCSV(file){
  return new Promise((resolve,reject)=>{
    if(!file){ reject('File not selected'); return;}
    Papa.parse(file,{
      header:true,dynamicTyping:true,skipEmptyLines:true,quoteChar:'"',escapeChar:'"',
      complete: res=>resolve(res.data),
      error: err=>reject(err.message)
    });
  });
}

function mergeData(tData,teData){
  const taggedTrain = tData.map(r=>({...r,Source:'train'}));
  const taggedTest  = teData.map(r=>({...r,Source:'test'}));
  return [...taggedTrain,...taggedTest];
}

function calcMissing(data){
  const cols = Object.keys(data[0]);
  const counts = {};
  cols.forEach(c=>counts[c]=0);
  data.forEach(row=>{
    cols.forEach(c=>{
      if(row[c]===''||row[c]===null||row[c]===undefined||Number.isNaN(row[c])) counts[c]++;
    });
  });
  const res = cols.map(c=>({col:c,perc:+((counts[c]/data.length)*100).toFixed(2)}));
  return res;
}

function numericColumns(data){
  const sample = data[0];
  return Object.keys(sample).filter(k=>typeof sample[k]==='number');
}

function calcNumericStats(data){
  const nums = numericColumns(data);
  const res = {};
  nums.forEach(col=>{
    const vals = data.map(r=>r[col]).filter(v=>v!==null && !Number.isNaN(v));
    const n = vals.length;
    if(n===0){return;}
    const mean = vals.reduce((a,b)=>a+b,0)/n;
    const sorted=[...vals].sort((a,b)=>a-b);
    const pct=q=>sorted[Math.floor(q*(n-1))];
    const std=Math.sqrt(vals.reduce((s,v)=>(s+Math.pow(v-mean,2)),0)/n);
    res[col]={count:n,mean:mean.toFixed(2),std:std.toFixed(2),min:sorted[0],
      q1:pct(0.25),median:pct(0.5),q3:pct(0.75),max:sorted[sorted.length-1]};
  });
  return res;
}

function calcCategoricalStats(data){
  const cols = Object.keys(data[0]).filter(k=>typeof data[0][k]!=='number');
  const survivedExists = data[0].hasOwnProperty('Survived');
  const res = {};
  cols.forEach(col=>{
    const counts = {};
    data.forEach(r=>{
      const key=r[col]??'Missing';
      const group = survivedExists?`${key} | Survived:${r['Survived']}`:key;
      counts[group]=(counts[group]||0)+1;
    });
    res[col]=counts;
  });
  return res;
}

function renderChart(ctxId,type,labels,dataset,labelTitle){
  const ctx = el(ctxId).getContext('2d');
  return new Chart(ctx,{
    type:type,
    data:{labels,datasets:[{label:labelTitle,data:dataset,backgroundColor:'rgba(54,162,235,0.6)'}]},
    options:{responsive:true,plugins:{legend:{display:false}}}
  });
}

function downloadFile(filename,content,mime){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);
  a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

// === UI renderers ===
function renderHead(data){
  const cols=Object.keys(data[0]);
  let html='<table><thead><tr>'+cols.map(c=>`<th>${c}</th>`).join('')+'</tr></thead><tbody>';
  data.slice(0,5).forEach(r=>{
    html+='<tr>'+cols.map(c=>`<td>${r[c]}</td>`).join('')+'</tr>';
  });
  html+='</tbody></table>';
  el('headTable').innerHTML=html;
}

function renderShape(rows){
  el('shapeInfo').innerHTML=`<p><b>Rows:</b> ${rows.length} | <b>Columns:</b> ${Object.keys(rows[0]).length}</p>`;
}

function renderMissingChart(missingArr){
  const labels=missingArr.map(o=>o.col);
  const data=missingArr.map(o=>o.perc);
  renderChart('missingChart','bar',labels,data,'Missing %');
}

function renderNumericTable(stats){
  const cols=Object.keys(stats);
  let html='<table><thead><tr><th>Column</th><th>Count</th><th>Mean</th><th>Std</th><th>Min</th><th>25%</th><th>50%</th><th>75%</th><th>Max</th></tr></thead><tbody>';
  cols.forEach(c=>{
    const s=stats[c];
    html+=`<tr><td>${c}</td><td>${s.count}</td><td>${s.mean}</td><td>${s.std}</td><td>${s.min}</td><td>${s.q1}</td><td>${s.median}</td><td>${s.q3}</td><td>${s.max}</td></tr>`;
  });
  html+='</tbody></table>';
  el('numStats').innerHTML=html;
}

function renderCategoricalTables(catStats){
  let html='';
  Object.entries(catStats).forEach(([col,counts])=>{
    html+=`<h4>${col}</h4><table><thead><tr><th>Category</th><th>Count</th></tr></thead><tbody>`;
    Object.entries(counts).forEach(([cat,val])=>{
      html+=`<tr><td>${cat}</td><td>${val}</td></tr>`;
    });
    html+='</tbody></table>';
  });
  el('catStats').innerHTML=html;
}

function renderBarCharts(data){
  const sexCounts={}, pclassCounts={}, embCounts={};
  data.forEach(r=>{
    sexCounts[r.Sex]=(sexCounts[r.Sex]||0)+1;
    pclassCounts[r.Pclass]=(pclassCounts[r.Pclass]||0)+1;
    embCounts[r.Embarked]=(embCounts[r.Embarked]||0)+1;
  });
  renderChart('sexChart','bar',Object.keys(sexCounts),Object.values(sexCounts),'Sex');
  renderChart('pclassChart','bar',Object.keys(pclassCounts),Object.values(pclassCounts),'Pclass');
  renderChart('embChart','bar',Object.keys(embCounts),Object.values(embCounts),'Embarked');
}

function renderHistogram(ctxId,dataArr,label){
  // Sturges rule bins
  const k=Math.ceil(Math.log2(dataArr.length)+1);
  const min=Math.min(...dataArr),max=Math.max(...dataArr);
  const binWidth=(max-min)/k;
  const bins=new Array(k).fill(0);
  dataArr.forEach(v=>{
    const idx=Math.min(Math.floor((v-min)/binWidth),k-1);
    bins[idx]++;
  });
  const labels=bins.map((_,i)=>`${(min+binWidth*i).toFixed(1)}-${(min+binWidth*(i+1)).toFixed(1)}`);
  renderChart(ctxId,'bar',labels,bins,label);
}

// === Main workflow ===
el('loadBtn').addEventListener('click',async()=>{
  try{
    el('loadStatus').textContent='Parsing…';
    trainData=await loadCSV(el('trainFile').files[0]);
    testData =await loadCSV(el('testFile').files[0]);
    merged=mergeData(trainData,testData);
    el('loadStatus').textContent='Files loaded successfully.';
    el('runBtn').disabled=false;
  }catch(err){
    alert('Load error: '+err);
  }
});

el('runBtn').addEventListener('click',()=>{
  if(!merged.length){alert('Load data first');return;}
  // Overview
  renderHead(merged);
  renderShape(merged);
  // Missing
  const missing=calcMissing(merged);
  renderMissingChart(missing);
  // Stats
  const numStats=calcNumericStats(merged);
  renderNumericTable(numStats);
  const catStats=calcCategoricalStats(merged);
  renderCategoricalTables(catStats);
  // Charts
  renderBarCharts(merged);
  const ageVals=merged.map(r=>r.Age).filter(v=>v!==null && !Number.isNaN(v));
  const fareVals=merged.map(r=>r.Fare).filter(v=>v!==null && !Number.isNaN(v));
  renderHistogram('ageHist',ageVals,'Age');
  renderHistogram('fareHist',fareVals,'Fare');
  // Summary JSON
  summaryJSON={missing,numStats,catStats};
  el('exportBtn').disabled=false;
});

el('exportBtn').addEventListener('click',()=>{
  if(!merged.length){alert('Nothing to export');return;}
  const csv=Papa.unparse(merged);
  downloadFile('titanic_merged.csv',csv,'text/csv');
  downloadFile('titanic_summary.json',JSON.stringify(summaryJSON,null,2),'application/json');
});
