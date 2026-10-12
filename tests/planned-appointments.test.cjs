const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const domain = require('../js/napi-domain.js');
const source = fs.readFileSync('js/app.js', 'utf8');
const formSource = source.slice(source.indexOf('  $("#workItemForm").addEventListener("submit"'), source.indexOf('  $("#workInboxList").addEventListener("click"'));
const types = {work:{label:'Munka'},survey:{label:'Felmérés'},meeting:{label:'Megbeszélés'},personal:{label:'Személyes'}};
for (const type of ['survey', 'meeting', 'personal', 'work']) {
  const plan = {date:'2026-10-13',workItems:[]};
  let submit;
  const fields = {
    '#workItemForm':{addEventListener: (_event, handler) => { submit=handler; }},
    '#workItemDate':{value:plan.date}, '#workItemType':{value:type},
    '#workItemCustomer':{value:'Teszt'}, '#workItemAddress':{value:'Cím'},
    '#workItemNote':{value:'Megjegyzés'}, '#workItemAppointmentTime':{value:'14:30'},
    '#weekView':{scrollIntoView(){}},
  };
  const context = {$:id=>fields[id],editingWorkItemDate:null,editingWorkItemId:null,
    workPlanForDate:()=>plan,customerDirectory:[],searchKey:s=>s,uid:()=> 'test-item',
    editingReminderTimes:['08:00','12:00'],persistWorkPlans(){},setWeekAnchor(){},setMonthAnchor(){},
    renderWorkItems(){},renderTasks(){},renderWeek(){},renderMonth(){},closeWorkItemDialog(){},toast(){}};
  vm.runInNewContext(formSource,context);
  submit({preventDefault(){}});
  const item=JSON.parse(JSON.stringify(plan.workItems[0]));
  assert.equal(item.type,type);
  assert.equal(item.appointmentTime,type==='work'?'':'14:30');
  assert.deepEqual(item.reminderTimes,type==='work'?[]:['08:00','12:00']);
  if(type!=='work'){
    const html=domain.renderWorkItemsHTML([item],types,plan.date);
    assert.ok(html.includes('Találkozó: 2026-10-13 14:30'));
    assert.ok(html.includes(types[type].label));
    const restored=domain.applyImportedData({plans:[]},{plans:[plan]},false).data.plans[0];
    assert.equal(restored.workItems[0].appointmentTime,'14:30');
  }
}
assert.equal(domain.appointmentLabel({appointmentTime:'25:00'},'2026-10-13'),'');
assert.equal(domain.appointmentLabel({},'2026-10-13'),'');
console.log('Találkozó időpont: mentés, típusok, további jelzések, import és megjelenítés: OK');
