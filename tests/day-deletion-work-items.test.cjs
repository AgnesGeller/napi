const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const domain=require('../js/napi-domain.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const date='2026-10-10';
const item={id:'w1',type:'meeting',customerName:'Megbeszélés',reminderTimes:['10:00']};
const original={id:'plan-1',date,tasks:[{id:'task'}],workItems:[item],meeting:'Indulás',generalNote:'Napi megjegyzés'};
const storage=new Map();
const app=fs.readFileSync('js/app.js','utf8');
let queued=[];
const context=vm.createContext({
  data:{plans:[copy(original)]},workingPlan:copy(original),dirty:true,
  window:{NapiDomain:domain},deepCopy:copy,formatDate:value=>value,confirm:()=>true,
  LOCAL_DATA_KEY:'data',RECOVERY_KEY:'recovery',
  localStorage:{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)||null,removeItem:key=>storage.delete(key)},
  syncDeletedDates:async dates=>{queued=dates;return false;},
  loadPlan:date=>{context.workingPlan=copy(context.data.plans.find(plan=>plan.date===date)||{date,tasks:[],workItems:[]});},
  renderWeek(){},renderMonth(){},toast(){},queueCloudSync(){}
});
vm.runInContext(app.slice(app.indexOf('  async function deleteDay('),app.indexOf('  function renderMonth(')),context);
(async()=>{
 await context.deleteDay(date);
 const reopened=JSON.parse(storage.get('data')).plans[0];
 assert.equal(reopened.tasks.length,0);
 assert.deepEqual(reopened.workItems,[item],'Offline törlés/frissítés után is megmarad az előjegyzés.');
 assert.deepEqual(context.workingPlan.workItems,[item]);assert.equal(queued[0],date);
 assert.equal(original.tasks.length,1,'Az eredeti példány nem módosulhat.');
 let server={plan_date:date,updated_at:'revision-1',payload:copy(original)};
 let race=false,requests=[];
 const syncContext=vm.createContext({
  window:{NapiDomain:domain,NapiCustomerDirectory:{session:async()=>({access_token:'a.b.c',user:{id:'owner'}})}},
  atob:()=>'',setTimeout,
  fetch:async(url,options)=>{
   requests.push(options.method);
   if(options.method==='GET')return {ok:true,text:async()=>JSON.stringify([copy(server)])};
   assert.equal(options.method,'POST','Közvetlen emlékeztető-törlés tilos.');
   const body=JSON.parse(options.body);
   if(race){race=false;server.payload.workItems.push({id:'w2',type:'survey',reminderTimes:['11:00']});server.updated_at='revision-2';}
   if(body.p_base_updated_at!==server.updated_at)return {ok:true,text:async()=>JSON.stringify({accepted:false,payload:server.payload,updated_at:server.updated_at})};
   const saved=body.p_payload.deleted ? body.p_payload : {...body.p_payload,workItems:domain.mergeWorkItems(server.payload.workItems,body.p_payload.workItems,body.p_payload.deletedWorkItemIds)};
   server={...server,payload:saved,updated_at:'revision-3'};
   return {ok:true,text:async()=>JSON.stringify({accepted:true,...server})};
  }
 });
 vm.runInContext(fs.readFileSync('js/napi-sync.js','utf8'),syncContext);
 const api=syncContext.window.NapiCloudSync;
 race=true;
 await assert.rejects(api.deletePlans([date],[reopened]),/közben megváltozott/);
 assert.equal(server.payload.tasks.length,1,'Versenyhelyzetnél a frissebb szerveradat nem törölhető.');
 const rows=await api.deletePlans([date],[reopened]);
 assert.equal(rows[0].payload.tasks.length,0);
 assert.equal(rows[0].payload.workItems.length,2,'Második eszköz új előjegyzése megmarad.');
 const thirdDevice=copy(rows[0].payload);
 assert.deepEqual(thirdDevice.workItems,server.payload.workItems,'A harmadik eszköz is ugyanazokat az előjegyzéseket tölti le.');
 assert.deepEqual(thirdDevice.workItems[0].reminderTimes,['10:00']);
 assert.ok(!requests.includes('DELETE'));
 Object.assign(context,{
  navigator:{onLine:true},cloudWritePromise:Promise.resolve(),cloudConfigDirty:false,
  pendingCloudDeletedDates:new Set([date]),pendingCloudPlanDates:new Set(),pendingCloudWorkItemDates:new Set(),
  persistPendingDeletionDates(){},persistPendingPlanDates(){},persistPendingWorkItemDates(){},
  planHasContent:domain.planHasPrintableContent,normalizedRemotePlan:copy
 });
 context.window.NapiCustomerDirectory={hasSession:()=>true};
 context.window.NapiCloudSync={deletePlans:async()=>rows};
 vm.runInContext(app.slice(app.indexOf('  async function pushCurrentState('),app.indexOf('  function queueCloudSync(')),context);
 assert.equal(await context.pushCurrentState(),true);
 const afterAcknowledgement=JSON.parse(storage.get('data')).plans[0];
 assert.equal(afterAcknowledgement.workItems.length,2,'A szerverről megőrzött új előjegyzés azonnal tartós helyi mentést kap.');
 assert.equal(context.pendingCloudDeletedDates.size,0);
 console.log('Napi törlés: offline megőrzés, újranyitás, három eszköz és konkurens előjegyzés: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
