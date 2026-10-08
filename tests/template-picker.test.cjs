const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/app.js', 'utf8');
const taskList = {addEventListener(name, callback) {this[name] = callback;}};
const documentEvents = {};
const cards = [0, 1].map(() => {
  const button = {setAttribute(key, value) {this[key] = value;}};
  const box = {hidden:true, closest:() => ({querySelector:() => button})};
  return {box, button, querySelector:selector => selector === '.job-template-suggestions' ? box : button};
});
const templates = [{id:'template-1', name:'Kertgondozás', note:'Leírás', active:true}];
const task = {id:'task-1', jobs:[{id:'job-1',templateId:'template-1'}, {id:'job-2'}]};
let saves = 0, renders = 0;
const context = vm.createContext({
  $:() => taskList, data:{templates}, workingPlan:{tasks:[task]},
  document:{querySelectorAll:() => cards.map(card => card.box), addEventListener:(name, handler) => {documentEvents[name] = handler;}},
  searchKey:value => value.toLowerCase(), activeSorted:items => items, escapeHTML:value => value,
  findTaskFromElement:() => task, clientIndexInTeam:() => 0, setActiveTask(){},
  taskJobs:task => task.jobs, markDirty:() => saves++, renderTasks:() => renders++
});
vm.runInContext(source.slice(source.indexOf('  function templateMatches('), source.indexOf('  function addCustomJob(')), context);
vm.runInContext(source.slice(source.indexOf('  $("#taskList").addEventListener("click"'), source.indexOf('  $("#taskList").addEventListener("input"')), context);
vm.runInContext(source.slice(source.indexOf('  document.addEventListener("click", event => { if (!event.target.closest(".job-template-picker"))'), source.indexOf('  function addTask(')), context);
function click(card, selector, selected = {}) {
  taskList.click({target:{closest:query => query === '.task-card' ? card : query === selector ? selected : null}});
}
click(cards[0], '.job-template-dropdown');
assert.equal(cards[0].box.hidden, false);
assert.equal(cards[0].button['aria-expanded'], 'true');
click(cards[0], '.job-template-dropdown');
assert.equal(cards[0].box.hidden, true, 'Második kattintás bezárja a sablonlistát.');
click(cards[0], '.job-template-dropdown');
documentEvents.click({target:{closest:() => null}});
assert.equal(cards[0].box.hidden, true, 'Kívülre kattintás bezárja a listát.');
click(cards[0], '.job-template-dropdown');
documentEvents.keydown({key:'Escape', target:{closest:() => cards[0]}});
assert.equal(cards[0].box.hidden, true);
click(cards[0], '.job-template-dropdown');
click(cards[1], '.job-template-dropdown');
assert.equal(cards[0].box.hidden, true, 'Másik sablonkereső megnyitása bezárja a korábbit.');
assert.equal(cards[1].box.hidden, false);
assert.equal(saves, 0, 'Nyitás és bezárás nem írhat napi adatot.');
click(cards[0], '[data-remove-job]', {dataset:{removeJob:'job-1'}});
assert.deepEqual(task.jobs, [{id:'job-2'}]);
assert.equal(templates.length, 1, 'A napi feladat törlése nem törölheti a sablont.');
assert.equal(saves, 1);
assert.equal(renders, 1);
console.log('Sablonlista: nyitás, bezárás, Escape, másik kártya és napi feladat eltávolítása: OK');
