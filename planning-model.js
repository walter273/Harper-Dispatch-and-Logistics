(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HarperTools = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const text = (v, limit=120) => String(v ?? '').trim().slice(0, limit);
  const key = v => text(v).toLowerCase().replace(/\s+/g, ' ');
  const number = (v, min=0, max=10000000) => {
    if (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v)<min || Number(v)>max) throw new Error('Enter valid non-negative numbers.');
    return Number(v);
  };
  function profit(input) {
    const rate=number(input.rate), miles=number(input.miles,1), deadhead=number(input.deadhead), mpg=number(input.mpg,0.1,100), fuel=number(input.fuel), other=number(input.other), days=number(input.days,0.1,365), fee=number(input.fee,0,100);
    const totalMiles=miles+deadhead, fuelCost=totalMiles/mpg*fuel, dispatchCost=rate*fee/100, cost=fuelCost+dispatchCost+other, net=rate-cost;
    return {totalMiles,fuelCost,dispatchCost,cost,net,perMile:rate/totalMiles,netPerMile:net/totalMiles,perDay:net/days,breakEven:(fuelCost+other)/(1-fee/100)};
  }
  function load(raw) {
    const row={id:text(raw.id,80),company:text(raw.company),origin:text(raw.origin),destination:text(raw.destination),equipment:text(raw.equipment),pickup:text(raw.pickup,10),source:text(raw.source,200),reference:text(raw.reference,120),status:raw.status==='closed'?'closed':'available',rate:number(raw.rate),miles:number(raw.miles,1),test:raw.test===true};
    if (!row.id || !row.company || !row.origin || !row.destination || !row.source) throw new Error('Company, locations, source and ID are required.');
    if (!['Dry Van','Reefer','Flatbed','Power Only','Box Truck','Other'].includes(row.equipment)) throw new Error('Choose a valid equipment type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.pickup) || !Number.isFinite(Date.parse(row.pickup)) || new Date(row.pickup).toISOString().slice(0,10)!==row.pickup) throw new Error('Enter a valid pickup date.');
    return row;
  }
  function matches(row, filter, blocked=[], favorites=[]) {
    return row.status==='available' && !blocked.some(c=>key(c)===key(row.company)) && (!filter.origin || key(row.origin).includes(key(filter.origin))) && (!filter.destination || key(row.destination).includes(key(filter.destination))) && (!filter.equipment || row.equipment===filter.equipment) && row.rate>=Number(filter.minimum||0) && (!filter.date || row.pickup>=filter.date) && (!filter.favorites || favorites.includes(row.id));
  }
  function returns(rows, selected, blocked=[]) {
    return rows.filter(r=>r.id!==selected.id && r.test===selected.test && key(r.origin)===key(selected.destination) && r.pickup>=selected.pickup && matches(r,{},blocked));
  }
  function trip(rows, gaps) {
    if (!rows.length) throw new Error('Add at least one load.');
    const loaded=rows.reduce((n,r)=>n+r.miles,0), rate=rows.reduce((n,r)=>n+r.rate,0);
    const deadhead=number(gaps);
    return {loaded,rate,deadhead,totalMiles:loaded+deadhead,perMile:rate/(loaded+deadhead)};
  }
  function restore(raw) {
    if (!raw || raw.version!==1 || !Array.isArray(raw.loads) || raw.loads.length>2000) throw new Error('Use a Harper workspace export with up to 2,000 loads.');
    const rows=raw.loads.map(load);
    if (new Set(rows.map(r=>r.id)).size!==rows.length) throw new Error('Duplicate load IDs in file.');
    return {version:1,loads:rows,favorites:Array.isArray(raw.favorites)?raw.favorites.filter(v=>rows.some(r=>r.id===v)):[],blocked:Array.isArray(raw.blocked)?raw.blocked.slice(0,500).map(v=>text(v)):[],alerts:Array.isArray(raw.alerts)?raw.alerts.slice(0,50).map(a=>({id:text(a.id,80),name:text(a.name),origin:text(a.origin),destination:text(a.destination),equipment:text(a.equipment),minimum:number(a.minimum||0),date:text(a.date,10),seen:Array.isArray(a.seen)?a.seen.filter(v=>typeof v==='string').slice(0,2000):[]})):[],trip:Array.isArray(raw.trip)?raw.trip.filter(v=>rows.some(r=>r.id===v)):[],density:['comfortable','compact','default'].includes(raw.density)?raw.density:'default'};
  }
  return {profit,load,matches,returns,trip,restore,key};
});
