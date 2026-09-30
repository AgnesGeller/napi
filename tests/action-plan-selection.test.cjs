const assert = require("node:assert/strict");
const fs = require("node:fs");
const domain = require("../js/napi-domain.js");

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
assert.match(appSource, /currentChanged[^\n]+loadPlan\([^\n]+selectForActions: false/, "A háttérszinkron nem állíthatja vissza a kézzel kiválasztott műveleti napot.");
assert.match(appSource, /planText\(selectedActionPlan\(\)\)/, "A szövegmásolásnak is a kiválasztott napot kell használnia.");

console.log("Műveleti napválasztó viselkedési teszt: OK");
