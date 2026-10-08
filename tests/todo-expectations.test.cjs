const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js', 'utf8');
function card() {
  const elements = new Map();
  return {dataset:{},classList:{toggle(){}},querySelector(selector) {
    if(!elements.has(selector)) elements.set(selector,{setAttribute(){},append(){}});
    return elements.get(selector);
  }};
}
const task = {id:'t1',teamId:'team',entryType:'customer',customerName:'Telephely',workerIds:[],vehicleIds:[],toolIds:[],materials:[],jobs:[],workIntensity:5,workQuality:4};
const taskList = {addEventListener(name, callback) {this[name]=callback;}};
let rendered, saves=0;
const context = vm.createContext({
  $:selector => selector === '#taskTemplate' ? {content:{firstElementChild:{cloneNode:card}}} : taskList,
  activeTaskId:null,collapsedTaskIds:new Set(),workingPlan:{tasks:[task]},
  data:{workers:[],vehicles:[],tools:[],materials:[]},activeSorted:()=>[],
  applyTaskVehicleTheme(){},updateTaskSummary(){},taskJobs:task=>task.jobs,
  renderJobRows(){},renderToolQuantities(){},renderRatingSelect(){},updateRatingDescriptions(){},
  INTENSITY_DESCRIPTIONS:{5:'Intenzív'},QUALITY_DESCRIPTIONS:{4:'Precíz'},
  findTaskFromElement:()=>task, markDirty:()=>saves++,
  renderTasks:()=>{rendered=context.renderTask(task,0,0,true);}
});
vm.runInContext(source.slice(source.indexOf('  function renderTask('),source.indexOf('  function renderToolQuantities(')),context);
vm.runInContext(source.slice(source.indexOf('  $("#taskList").addEventListener("change"'),source.indexOf('  $("#taskList").addEventListener("focusin"')),context);
rendered=context.renderTask(task,0,0,true);
assert.equal(rendered.querySelector('.expectations').hidden,false);
function select(value) {taskList.change({target:{closest:()=>rendered,matches:selector=>selector==='.task-entry-type',value}});}
select('todo');
assert.equal(rendered.querySelector('.expectations').hidden,true,'Teendőnél rejtett elvárások.');
assert.equal(task.workIntensity,5);
assert.equal(task.workQuality,4);
select('customer');
assert.equal(rendered.querySelector('.expectations').hidden,false,'Ügyfélre visszaváltva ismét látható elvárások.');
assert.equal(task.workIntensity,5,'Típusváltás nem törölheti a meglévő értéket.');
assert.equal(saves,2);
context.document={baseURI:'https://example.test/'};
context.URL=URL;context.escapeHTML=String;context.formatDate=date=>date;
context.tasksByTeam=plan=>[{tasks:plan.tasks}];context.byId=()=>undefined;
context.clientNumberForVehicle=()=>1;context.taskDisplayName=task=>task.customerName;
context.taskEntryLabel=task=>task.entryType==='todo'?'Teendő':'Ügyfél';
context.jobDescriptions=()=>[];context.validRating=value=>value;context.FINAL_NOTE='Nap vége';
vm.runInContext(source.slice(source.indexOf('  function planText('),source.indexOf('  function printPlanHTML(')),context);
const plan={date:'2026-10-08',tasks:[task],workItems:[]};
assert.ok(context.planText(plan).includes('Precíz'));
task.entryType='todo';
const text=context.planText(plan);
assert.ok(!text.includes('Munkavégzés:')&&!text.includes('Intenzív')&&!text.includes('Precíz'));
assert.ok(text.includes('Telephely'),'A teendő tartalma megmarad.');
console.log('Teendő elvárások: típusváltás, visszaállítás és másolható szöveg: OK');
