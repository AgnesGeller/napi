const assert = require("node:assert/strict");
const fs = require("node:fs");
const domain = require("../js/napi-domain.js");
const vm = require("node:vm");

const oldPlan = { id: "old", date: "2026-09-28", tasks: [{ id: "old-task" }], workItems: [] };
const storedCurrent = { id: "current", date: "2026-09-30", tasks: [{ id: "stored-task" }], workItems: [] };
const appointmentPlan = { id: "future", date: "2026-10-02", tasks: [], workItems: [{ id: "meeting" }] };
const emptyPlan = { id: "empty", date: "2026-10-03", tasks: [], workItems: [] };
const workingPlan = { ...storedCurrent, tasks: [{ id: "edited-task" }] };

const choices = domain.availableActionPlans([oldPlan, storedCurrent, appointmentPlan, emptyPlan], workingPlan);
assert.deepEqual(choices.map(plan => plan.date), ["2026-10-02", "2026-09-30", "2026-09-28"], "Csak a küldhető napok jelenjenek meg, dátum szerint rendezve.");
assert.equal(choices.find(plan => plan.date === workingPlan.date).tasks[0].id, "edited-task", "A megnyitott nap aktuális változata legyen választható.");
assert.equal(domain.actionPlanForDate([oldPlan, storedCurrent], workingPlan, "2026-09-28"), oldPlan);
assert.equal(domain.actionPlanForDate([oldPlan, storedCurrent], workingPlan, "2026-09-30"), workingPlan);
assert.equal(domain.actionPlanForDate([oldPlan], workingPlan, "2026-10-04"), null);

const appSource = fs.readFileSync("js/app.js", "utf8");
assert.match(appSource, /planText\(selectedActionPlan\(\)\)/, "A szövegmásolásnak is a kiválasztott napot kell használnia.");

// Run the production action-date functions with an actual date-input value.
const actionFunctions = appSource.slice(appSource.indexOf('  function refreshActionPlanOptions('), appSource.indexOf('  function planText('));
const input = { value: '' };
const context = vm.createContext({ $: () => input, isoToday: () => '2026-09-30', formatDate: date => date, window: {NapiDomain: domain}, data: {plans: [oldPlan, storedCurrent]}, workingPlan: {date:'2026-10-01',tasks:[],workItems:[]} });
vm.runInContext(actionFunctions, context);
context.refreshActionPlanOptions();
assert.equal(input.value, '2026-09-30', 'A műveletek mai tervvel induljanak akkor is, ha a szerkesztőben a holnap van megnyitva.');
assert.equal(context.selectedActionPlan(), storedCurrent, 'A PDF a kitöltött mai tervet használja az üres holnapi helyett.');
input.value = oldPlan.date;
context.refreshActionPlanOptions();
assert.equal(context.selectedActionPlan(), oldPlan, 'A naptárban kiválasztott korábbi nap maradjon meg frissítéskor.');
input.value = '2026-10-01';
assert.throws(() => context.selectedActionPlan(), /nincs feladat vagy előjegyzés/, 'Üres napból ne készüljön félrevezető PDF.');

let dockClick;
let dockClosed = false;
const dockContext = vm.createContext({document:{querySelector:()=>({addEventListener:(_type, callback)=>{dockClick=callback;}})},window:{matchMedia:()=>({matches:true})},setDockOpen:open=>{dockClosed=!open;}});
vm.runInContext(appSource.split('\n').find(line=>line.includes('document.querySelector(".dock-buttons").addEventListener("click"')), dockContext);
dockClick({target:{closest:()=>null}});
assert.equal(dockClosed,false,'A naptárra kattintás nem zárhatja be a mobilos panelt.');
dockClick({target:{closest:()=>({tagName:'BUTTON'})}});
assert.equal(dockClosed,true,'A műveleti gombok továbbra is becsukják a mobilos panelt.');

console.log("Műveleti napválasztó viselkedési teszt: OK");
