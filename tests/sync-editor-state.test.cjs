const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const domain = require('../js/napi-domain.js');
const source = fs.readFileSync('js/app.js','utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const plan = {id:'plan',date:'2026-09-29',tasks:[{id:'task',notes:'Eredeti'}],workItems:[],deletedWorkItemIds:[]};
let row = {plan_date:plan.date,updated_at:'revision-1',payload:clone(plan)};
let renders = 0, focused = false;
const fields = new Map();
const context = vm.createContext({
  window:{NapiDomain:domain,NapiCustomerDirectory:{hasSession:()=>true},NapiCloudSync:{pull:async()=>({plans:[clone(row)],config:null})}},
  navigator:{onLine:true},document:{get activeElement(){return {closest:()=>focused ? {} : null};}},
  data:{plans:[clone(plan)]},workingPlan:clone(plan),dirty:false,cloudSyncing:false,
  cloudConfigDirty:false,pendingConfigChanges:[],pendingCloudPlanDates:new Set(),pendingCloudWorkItemDates:new Set(),pendingCloudDeletedDates:new Set(),
  activeTaskId:'task',collapsedTaskIds:new Set(),
  $:selector=>{if(!fields.has(selector)) fields.set(selector,{open:false});return fields.get(selector);},
  normalizedRemotePlan:clone,deepCopy:clone,blankPlan:date=>({date,tasks:[],workItems:[]}),
  planHasContent:value=>Boolean(value?.tasks?.length || value?.workItems?.length),
  renderTasks:()=>renders++,renderWorkItems(){},renderPrintView(){},renderWeek(){},renderMonth(){},
  refreshActionPlanOptions(){},persistPendingPlanDates(){},persistPendingDeletionDates(){},
  setWeekAnchor(){},setMonthAnchor(){},DEFAULT_MEETING:'',DEFAULT_STOPS:'',RECOVERY_KEY:'recovery',LOCAL_DATA_KEY:'data',
  localStorage:{setItem(){},removeItem(){}},console
});
vm.runInContext(source.slice(source.indexOf('  function loadPlan('),source.indexOf('  function changeDate(')),context);
vm.runInContext(source.slice(source.indexOf('  async function pullSharedData('),source.indexOf('  async function pushCurrentState(')),context);
(async()=>{
  assert.equal(domain.samePlanContent({tasks:[{a:1,b:2}],updatedAt:'old'},{cloudUpdatedAt:'new',tasks:[{b:2,a:1}]}),true);
  await context.pullSharedData(); await context.pullSharedData();
  assert.equal(renders,0,'Változatlan szerverválasz nem rajzolhatja újra/becsukhatja a szerkesztőt.');
  assert.equal(context.workingPlan.cloudUpdatedAt,'revision-1','A CAS-verzió újrarajzolás nélkül is frissüljön.');
  row.updated_at='revision-2'; row.payload.tasks[0].notes='Másik eszköz';
  await context.pullSharedData();
  assert.equal(context.workingPlan.tasks[0].notes,'Másik eszköz');
  assert.equal(context.collapsedTaskIds.has('task'),false,'A valódi szerverfrissítés is tartsa nyitva a szerkesztett kártyát.');
  assert.equal(context.activeTaskId,'task');
  focused=true; row.updated_at='revision-3';row.payload.tasks[0].notes='Újabb változás';
  await context.pullSharedData();
  assert.equal(context.workingPlan.tasks[0].notes,'Másik eszköz','Fókuszált mezőt ne cseréljen le a háttérlekérés.');
  focused=false; await context.pullSharedData();
  assert.equal(context.workingPlan.tasks[0].notes,'Újabb változás','A halasztott szerveradat fókusz után se vesszen el.');
  context.dirty=true;context.pendingCloudPlanDates.add(plan.date);
  context.workingPlan.tasks[0].notes='Helyi módosítás';context.data.plans[0]=clone(context.workingPlan);
  await context.pullSharedData();
  assert.equal(context.workingPlan.tasks[0].notes,'Helyi módosítás');
  assert.equal(context.data.plans[0].tasks[0].notes,'Helyi módosítás');
  context.dirty=false;context.pendingCloudPlanDates.clear();row.payload={deleted:true};
  await context.pullSharedData();const afterDeletion=renders;
  await context.pullSharedData();
  assert.equal(renders,afterDeletion,'Az ismételt törlési jelölés nem töltheti újra az üres szerkesztőt.');
  console.log('Szerkesztő és szinkron: változatlan válasz, valódi változás, fókusz, helyi piszkozat és törlés: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
