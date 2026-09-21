(() => {
  "use strict";

  const DATA_FILE_NAME = "diszkertek-napi-adatok.json";
  const RECOVERY_KEY = "diszkertek-napi-helyreallitas-v1";
  const DB_NAME = "diszkertek-napi-mappakapcsolat";
  const DB_STORE = "handles";
  const FINAL_NOTE = "A nap végén mindenki vegye ki a szemetét az autóból és hagyjon rendet maga után!";
  const DEFAULT_MEETING = "telephely, 6:30";
  const DEFAULT_STOPS = "Vizeshűtő, Lidl, Dohánybolt";
  const $ = selector => document.querySelector(selector);
  const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deepCopy = value => JSON.parse(JSON.stringify(value));
  const isoToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const escapeHTML = value => String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  const searchKey = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hu-HU").trim();
  const readableError = error => error?.name === "AbortError" ? "A művelet megszakadt." : (error?.message || "Váratlan hiba történt.");

  const workerSeeds = [
    ["Márk", "#22577a", false], ["Gábor", "#8a4f14", false], ["Attila", "#7a3e65", false],
    ["Gyula", "#356859", false], ["Bendegúz", "#795548", false], ["Ádám", "#5d4e9b", false], ["Tamás", "#9a342b", true]
  ];
  const workerPalette = ["#22577a", "#8a4f14", "#7a3e65", "#356859", "#795548", "#5d4e9b", "#9a342b", "#2f6944", "#c05a24", "#56636b"];
  const toolSeeds = ["hosszúláncos", "sövénynyíró", "kisláncos", "hosszúfűrész", "damilos", "kék villa", "big bag zsák", "fűhenger", "talicska", "gereblye", "lapát", "ásó"];
  const materialSeeds = ["Termőföld", "Támfalkő", "Vasgálic", "Magellan", "Amalgerol", "Amistar", "Cemix gyorskötő beton", "2–5-ös andezit"];

  function createInitialData() {
    const workers = workerSeeds.map(([name, color, manager], index) => ({ id: uid(), name, color, manager, active: true, order: index }));
    const vehicles = ["Platós", "Dobozos", "Merci", "Opel"].map((name, index) => ({ id: uid(), name, active: true, order: index }));
    const tools = toolSeeds.map((name, index) => ({ id: uid(), name, active: true, order: index }));
    const materials = materialSeeds.map((name, index) => ({ id: uid(), name, active: true, order: index }));
    const toolId = name => tools.find(tool => tool.name === name)?.id;
    const templates = [
      {
        id: uid(), name: "Kertkarbantartás", active: true, toolIds: [], materials: [],
        steps: ["Kertkarbantartás elvégzése.", "Munkanapló megírása."], order: 0
      },
      {
        id: uid(), name: "Favágás és zöldhulladék", active: true,
        toolIds: ["hosszúláncos", "kisláncos", "hosszúfűrész", "kék villa", "big bag zsák"].map(toolId).filter(Boolean),
        materials: [], steps: ["Favágás elvégzése.", "A zöldhulladék összegyűjtése.", "Munkanapló megírása."], order: 1
      },
      {
        id: uid(), name: "Füvesítés és támfalépítés", active: true,
        toolIds: ["fűhenger", "talicska", "gereblye", "lapát", "ásó"].map(toolId).filter(Boolean),
        materials: [{ name: "Termőföld", quantity: "", unit: "m³" }, { name: "Támfalkő", quantity: "", unit: "db" }],
        steps: ["A terület előkészítése.", "A füvesítés és támfalépítés elvégzése.", "A terület rendbetétele.", "Munkanapló megírása."], order: 2
      },
      {
        id: uid(), name: "Vakondháló terítése", active: true,
        toolIds: ["gereblye", "lapát", "fűhenger"].map(toolId).filter(Boolean), materials: [],
        steps: ["A vakondháló kifeszítése és leszúróval rögzítése.", "A termőföld szintre húzása és hengerezése.", "Munkanapló megírása."], order: 3
      },
      {
        id: uid(), name: "Indulás előtti feladatok", active: true, toolIds: [], materials: [],
        steps: ["Rendrakás.", "Anyagok feltöltése.", "Üzemanyagok és olajok feltöltése.", "Zöldhulladék rendezése.", "Zsákok kiürítése.", "Szerszámok ellenőrzése.", "Szervizelendő gépek elkülönítése."], order: 4
      },
      {
        id: uid(), name: "Aknaépítés", active: true, toolIds: [], materials: [],
        steps: ["Aknaépítés folytatása.", "Munkanapló megírása."], order: 5
      },
      {
        id: uid(), name: "Talajpermetezés – 4 in 1", active: true, toolIds: [],
        materials: [
          { name: "Vasgálic", quantity: "150", unit: "g / 15 l víz" },
          { name: "Magellan", quantity: "1", unit: "kupak / 15 l víz" },
          { name: "Amalgerol", quantity: "150", unit: "ml / 15 l víz" },
          { name: "Amistar", quantity: "15", unit: "ml / 15 l víz" }
        ],
        steps: ["Ha a gyomirtós permetezővel dolgoztok, előtte a tartályt és a pisztolyt is alaposan ki kell öblíteni.", "A keverék elkészítése a megadott arányban.", "Talajpermetezés elvégzése."], order: 6
      }
    ];
    return { version: 1, updatedAt: new Date().toISOString(), workers, vehicles, tools, materials, templates, customers: [], plans: [] };
  }

  let data = createInitialData();
  let workingPlan = blankPlan(isoToday());
  let directoryHandle = null;
  let dirty = false;
  let activeSettingsTab = "workers";
  let editingSettingsId = null;
  let pendingCustomerTaskId = null;
  let weekAnchor = isoToday();
  let installPrompt = null;
  let activeTaskId = null;

  function blankTask() {
    return { id: uid(), customerId: null, customerName: "", address: "", workerIds: [], vehicleIds: [], templateId: null, title: "", toolIds: [], extraTools: "", materials: [], steps: [], notes: "" };
  }
  function blankPlan(date) { return { id: uid(), date, meeting: DEFAULT_MEETING, stops: DEFAULT_STOPS, tasks: [] }; }
  function normalizeData(candidate) {
    if (!candidate || typeof candidate !== "object") throw new Error("Az adatfájl nem megfelelő formátumú.");
    const initial = createInitialData();
    return {
      version: 1,
      updatedAt: candidate.updatedAt || new Date().toISOString(),
      workers: Array.isArray(candidate.workers) ? candidate.workers : initial.workers,
      vehicles: Array.isArray(candidate.vehicles) ? candidate.vehicles : initial.vehicles,
      tools: Array.isArray(candidate.tools) ? candidate.tools : initial.tools,
      materials: Array.isArray(candidate.materials) ? candidate.materials : initial.materials,
      templates: Array.isArray(candidate.templates) ? candidate.templates : initial.templates,
      customers: Array.isArray(candidate.customers) ? candidate.customers : [],
      plans: Array.isArray(candidate.plans) ? candidate.plans.map(plan => ({
        ...plan,
        meeting: typeof plan.meeting === "string" ? plan.meeting : DEFAULT_MEETING,
        stops: typeof plan.stops === "string" ? plan.stops : DEFAULT_STOPS,
        tasks: Array.isArray(plan.tasks) ? plan.tasks : []
      })) : []
    };
  }
  function dateFromISO(value) { return new Date(`${value}T12:00:00`); }
  function formatDate(value, options = { year: "numeric", month: "long", day: "numeric", weekday: "long" }) {
    return new Intl.DateTimeFormat("hu-HU", options).format(dateFromISO(value));
  }
  function dateOffset(value, days) {
    const date = dateFromISO(value); date.setDate(date.getDate() + days);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function startOfWeek(value) {
    const date = dateFromISO(value); const daysSinceFriday = (date.getDay() - 5 + 7) % 7; date.setDate(date.getDate() - daysSinceFriday);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function activeSorted(collection) { return collection.filter(item => item.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "hu")); }
  function byId(collection, id) { return collection.find(item => item.id === id); }
  function currentStoredPlan() { return data.plans.find(plan => plan.date === workingPlan.date); }

  function markDirty(message = "Mentetlen módosítás") {
    dirty = true;
    $("#saveState").textContent = message;
    try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data, workingPlan })); } catch (_) { /* A mappamentés ettől még használható. */ }
  }
  function markSaved() {
    dirty = false;
    $("#saveState").textContent = `Elmentve • ${new Date().toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}`;
    try { localStorage.removeItem(RECOVERY_KEY); } catch (_) { /* Nincs teendő. */ }
  }
  function setDockOpen(open) {
    const dock = document.querySelector(".action-dock"); const button = $("#dockToggleButton");
    dock.classList.toggle("is-open", open); document.body.classList.toggle("actions-open", open);
    button.setAttribute("aria-expanded", String(open)); button.textContent = open ? "Bezárás ×" : "Műveletek";
  }
  $("#dockToggleButton").addEventListener("click", () => setDockOpen(!document.querySelector(".action-dock").classList.contains("is-open")));
  document.querySelector(".dock-buttons").addEventListener("click", () => { if (window.matchMedia("(max-width: 760px)").matches) setDockOpen(false); });
  window.matchMedia("(min-width: 761px)").addEventListener?.("change", event => { if (event.matches) setDockOpen(false); });
  function toast(message, error = false) {
    const element = document.createElement("div");
    element.className = `app-toast${error ? " error" : ""}`;
    element.textContent = message;
    $("#toastRegion").append(element);
    setTimeout(() => element.remove(), 4200);
  }

  function openHandleDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function storeDirectoryHandle(handle) {
    const database = await openHandleDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(handle, "directory");
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }
  async function readStoredDirectoryHandle() {
    const database = await openHandleDatabase();
    const handle = await new Promise((resolve, reject) => {
      const request = database.transaction(DB_STORE).objectStore(DB_STORE).get("directory");
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
    database.close(); return handle;
  }
  async function hasWritePermission(handle, request = false) {
    const options = { mode: "readwrite" };
    if ((await handle.queryPermission(options)) === "granted") return true;
    return request && (await handle.requestPermission(options)) === "granted";
  }
  async function readDataFile(handle) {
    const fileHandle = await handle.getFileHandle(DATA_FILE_NAME, { create: true });
    const file = await fileHandle.getFile();
    if (!file.size) return null;
    return normalizeData(JSON.parse(await file.text()));
  }
  async function writeDataFile() {
    if (!directoryHandle || !(await hasWritePermission(directoryHandle, true))) {
      if (!("showDirectoryPicker" in window)) $("#fileFallbackDialog").showModal();
      else toast("Előbb válaszd ki a mentési mappát.", true);
      return false;
    }
    upsertWorkingPlan();
    data.updatedAt = new Date().toISOString();
    $("#saveState").textContent = "Mentés…";
    const fileHandle = await directoryHandle.getFileHandle(DATA_FILE_NAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    markSaved();
    return true;
  }
  async function chooseFolder() {
    if (!("showDirectoryPicker" in window)) { $("#fileFallbackDialog").showModal(); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "diszkertek-napi-adatok" });
      if (!(await hasWritePermission(handle, true))) throw new Error("A mappa írásához engedély szükséges.");
      const loaded = await readDataFile(handle);
      if (loaded && dirty && !confirm("A kiválasztott mappa adatfájlja felülírja a mostani, mentetlen tervet. Folytatod?")) return;
      directoryHandle = handle;
      await storeDirectoryHandle(handle);
      if (loaded) data = loaded;
      else await writeDataFile();
      updateStorageStatus();
      loadPlan($("#planDate").value || isoToday());
      toast(loaded ? "Az adatfájl betöltődött." : "A mentési mappa elkészült.");
    } catch (error) {
      if (error?.name !== "AbortError") toast(readableError(error), true);
    }
  }
  function updateStorageStatus() {
    const strip = $("#storageStrip"); const refreshButton = $("#refreshButton");
    if (directoryHandle) {
      strip.classList.add("ready");
      $("#storageText").textContent = `Mentési mappa: ${directoryHandle.name} • ${DATA_FILE_NAME}`;
      $("#folderButton").textContent = "📁 Mappa cseréje";
      refreshButton.disabled = false; refreshButton.title = "Adatok újratöltése a csatlakoztatott mappából";
    } else {
      strip.classList.remove("ready");
      $("#storageText").textContent = "Válassz mentési mappát. Addig a terv biztonsági piszkozatként megmarad ezen az eszközön.";
      refreshButton.disabled = true; refreshButton.title = "Előbb válassz mentési mappát";
    }
  }
  async function refreshFromFile() {
    if (!directoryHandle) { toast("Nincs csatlakoztatott mappa. Használd a Mappa kiválasztása gombot.", true); return; }
    if (!(await hasWritePermission(directoryHandle, false))) { toast("A mappa már nem érhető el. Csatlakoztasd újra a Mappa kiválasztása gombbal.", true); return; }
    if (dirty && !confirm("A frissítés elveti a még nem mentett módosításokat. Folytatod?")) return;
    try {
      const loaded = await readDataFile(directoryHandle);
      if (loaded) data = loaded;
      loadPlan($("#planDate").value || isoToday());
      toast("Az adatok frissültek.");
    } catch (error) { toast(`A frissítés nem sikerült: ${readableError(error)}`, true); }
  }
  function downloadData() {
    upsertWorkingPlan();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = DATA_FILE_NAME; link.click(); URL.revokeObjectURL(link.href);
    markSaved(); toast("Az adatfájl letöltődött.");
  }
  function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
  }
  function exportPeriod(period) {
    upsertWorkingPlan();
    const reference = workingPlan.date;
    let plans = data.plans;
    let suffix = "teljes";
    if (period === "week") {
      const from = startOfWeek(reference); const to = dateOffset(from, 6);
      plans = plans.filter(plan => plan.date >= from && plan.date <= to); suffix = `het-${from}`;
    } else if (period === "month") {
      const month = reference.slice(0, 7); plans = plans.filter(plan => plan.date.startsWith(month)); suffix = `honap-${month}`;
    } else if (period === "year") {
      const year = reference.slice(0, 4); plans = plans.filter(plan => plan.date.startsWith(year)); suffix = `ev-${year}`;
    }
    const payload = { ...deepCopy(data), exportType: period, exportedAt: new Date().toISOString(), plans: deepCopy(plans) };
    downloadJSON(payload, `diszkertek-napi-${suffix}.json`);
    toast(`${period === "week" ? "A heti" : period === "month" ? "A havi" : period === "year" ? "Az éves" : "A teljes"} adatfájl letöltődött.`);
  }
  async function importDataFile(file) {
    try {
      const imported = JSON.parse(await file.text());
      if (dirty && !confirm("A megnyitott adatfájl módosítja a mostani adatokat. Folytatod?")) return;
      if (imported.exportType && imported.exportType !== "all") {
        const incoming = normalizeData(imported); const mergedPlans = new Map(data.plans.map(plan => [plan.date, plan]));
        incoming.plans.forEach(plan => mergedPlans.set(plan.date, plan)); data.plans = [...mergedPlans.values()].sort((a, b) => b.date.localeCompare(a.date));
      } else data = normalizeData(imported);
      loadPlan($("#planDate").value || isoToday());
      markSaved(); toast("Az adatfájl megnyílt."); $("#fileFallbackDialog").close();
    } catch (error) { toast(`Az adatfájl nem nyitható meg: ${readableError(error)}`, true); }
  }

  function upsertWorkingPlan() {
    const index = data.plans.findIndex(plan => plan.date === workingPlan.date);
    const clean = deepCopy(workingPlan);
    if (index >= 0) data.plans[index] = clean; else data.plans.push(clean);
    data.plans.sort((a, b) => b.date.localeCompare(a.date));
  }
  function loadPlan(date) {
    const stored = data.plans.find(plan => plan.date === date);
    workingPlan = stored ? deepCopy(stored) : blankPlan(date);
    activeTaskId = workingPlan.tasks[0]?.id || null;
    $("#planDate").value = date;
    $("#meetingInput").value = workingPlan.meeting ?? DEFAULT_MEETING;
    $("#stopsInput").value = workingPlan.stops ?? DEFAULT_STOPS;
    weekAnchor = date;
    dirty = false;
    $("#saveState").textContent = stored ? "Betöltve • nincs mentetlen módosítás" : "Új napi terv";
    renderTasks();
    if (!$("#weekView").hidden) renderWeek();
  }
  function changeDate(date) {
    if (dirty && !confirm("A dátumváltás elveti a még nem mentett módosításokat. Folytatod?")) { $("#planDate").value = workingPlan.date; return; }
    loadPlan(date);
  }

  function makeChip(label, pressed, className, attributes = {}) {
    const button = document.createElement("button"); button.type = "button"; button.className = `choice-chip ${className || ""}`.trim(); button.textContent = label; button.setAttribute("aria-pressed", String(Boolean(pressed)));
    Object.entries(attributes).forEach(([key, value]) => { if (key === "style") button.setAttribute("style", value); else button.dataset[key] = value; });
    return button;
  }
  function renderMaterial(container, material, index) {
    const row = $("#materialTemplate").content.firstElementChild.cloneNode(true); row.dataset.materialIndex = index;
    row.querySelector(".material-name").value = material.name || ""; row.querySelector(".material-quantity").value = material.quantity || ""; row.querySelector(".material-unit").value = material.unit || "";
    container.append(row);
  }
  function renderTask(task, index) {
    const card = $("#taskTemplate").content.firstElementChild.cloneNode(true); card.dataset.taskId = task.id;
    card.classList.toggle("is-active", task.id === activeTaskId); card.querySelector(".active-badge").hidden = task.id !== activeTaskId;
    card.querySelector(".task-number").textContent = `${index + 1}.`;
    updateTaskSummary(card, task, index);
    card.querySelector(".move-up").disabled = index === 0; card.querySelector(".move-down").disabled = index === workingPlan.tasks.length - 1;
    card.querySelector(".customer-input").value = task.customerName || ""; card.querySelector(".address-input").value = task.address || ""; card.querySelector(".title-input").value = task.title || "";
    card.querySelector(".extra-tools-input").value = task.extraTools || ""; card.querySelector(".steps-input").value = (task.steps || []).join("\n"); card.querySelector(".notes-input").value = task.notes || "";
    const workerContainer = card.querySelector(".worker-chips");
    activeSorted(data.workers).forEach(worker => workerContainer.append(makeChip(worker.name, task.workerIds.includes(worker.id), "worker-chip", { group: "worker", id: worker.id, style: `--worker-color:${worker.color};--chip-text:${bestTextColor(worker.color)}` })));
    const vehicleContainer = card.querySelector(".vehicle-chips");
    activeSorted(data.vehicles).forEach(vehicle => vehicleContainer.append(makeChip(vehicle.name, task.vehicleIds.includes(vehicle.id), "", { group: "vehicle", id: vehicle.id })));
    const templateContainer = card.querySelector(".template-chips");
    activeSorted(data.templates).forEach(template => templateContainer.append(makeChip(template.name, task.templateId === template.id, "", { templateId: template.id })));
    const toolContainer = card.querySelector(".tool-chips");
    activeSorted(data.tools).forEach(tool => toolContainer.append(makeChip(tool.name, task.toolIds.includes(tool.id), "", { group: "tool", id: tool.id })));
    const materialChipContainer = card.querySelector(".material-chips");
    activeSorted(data.materials).forEach(material => materialChipContainer.append(makeChip(material.name, task.materials.some(item => searchKey(item.name) === searchKey(material.name)), "", { materialId: material.id })));
    const materials = card.querySelector(".materials-list"); (task.materials || []).forEach((material, materialIndex) => renderMaterial(materials, material, materialIndex));
    return card;
  }
  function bestTextColor(hex) {
    const raw = String(hex || "#000000").replace("#", "");
    if (raw.length !== 6) return "#fff";
    const [r, g, b] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)].map(value => parseInt(value, 16));
    return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#172019" : "#fff";
  }
  function validWorkerColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : "#2f6944"; }
  function renderTasks() {
    const list = $("#taskList"); list.innerHTML = "";
    workingPlan.tasks.forEach((task, index) => list.append(renderTask(task, index)));
    $("#emptyState").hidden = workingPlan.tasks.length > 0;
    $("#addTaskBottomButton").hidden = workingPlan.tasks.length === 0;
  }
  function findTaskFromElement(element) { return workingPlan.tasks.find(task => task.id === element.closest(".task-card")?.dataset.taskId); }
  function setActiveTask(card, task) {
    if (!card || !task || activeTaskId === task.id) return;
    activeTaskId = task.id;
    document.querySelectorAll(".task-card").forEach(item => {
      const active = item.dataset.taskId === activeTaskId; item.classList.toggle("is-active", active); item.querySelector(".active-badge").hidden = !active;
    });
  }
  function taskPeopleAndVehicle(task) {
    return {
      workers: (task.workerIds || []).map(id => byId(data.workers, id)?.name).filter(Boolean),
      vehicles: (task.vehicleIds || []).map(id => byId(data.vehicles, id)?.name).filter(Boolean)
    };
  }
  function updateTaskSummary(card, task, index = workingPlan.tasks.indexOf(task)) {
    const { workers, vehicles } = taskPeopleAndVehicle(task);
    card.querySelector(".task-number").textContent = `${index + 1}.`;
    card.querySelector(".task-summary").textContent = vehicles.join(" + ") || "Autó kiválasztása";
    card.querySelector(".task-team-summary").textContent = workers.length ? `Dolgozók: ${workers.join(", ")}` : "Dolgozók kiválasztása";
    card.querySelector(".task-client-name").textContent = task.customerName || "Nincs kiválasztva";
    card.querySelector(".task-client-address").textContent = task.address || "Nincs megadva";
  }
  function toggleInList(list, id) { const index = list.indexOf(id); if (index >= 0) list.splice(index, 1); else list.push(id); }
  function applyTemplate(task, template) {
    task.templateId = template.id; task.title = template.name; task.toolIds = deepCopy(template.toolIds || []); task.materials = deepCopy(template.materials || []); task.steps = deepCopy(template.steps || []);
    markDirty("A sablon beillesztve • mentés szükséges"); renderTasks();
  }
  function customerMatches(query, showAll = false) {
    const needle = searchKey(query);
    if (!showAll && needle.length < 2) return [];
    return activeSorted(data.customers).filter(customer => !needle || searchKey(`${customer.name} ${customer.address}`).includes(needle)).slice(0, 8);
  }
  function showCustomerSuggestions(card, query, showAll = false) {
    const box = card.querySelector(".customer-suggestions"); const matches = customerMatches(query, showAll);
    box.innerHTML = matches.map(customer => `<button type="button" data-customer-choice="${escapeHTML(customer.id)}"><b>${escapeHTML(customer.name)}</b><small>${escapeHTML(customer.address || "Nincs megadott cím")}</small></button>`).join("");
    box.hidden = matches.length === 0;
  }

  $("#taskList").addEventListener("click", event => {
    const card = event.target.closest(".task-card"); if (!card) return;
    const task = findTaskFromElement(card); const index = workingPlan.tasks.indexOf(task);
    setActiveTask(card, task);
    const chip = event.target.closest(".choice-chip");
    if (chip?.dataset.group) {
      const target = chip.dataset.group === "worker" ? task.workerIds : chip.dataset.group === "vehicle" ? task.vehicleIds : task.toolIds;
      toggleInList(target, chip.dataset.id); chip.setAttribute("aria-pressed", String(target.includes(chip.dataset.id))); updateTaskSummary(card, task, index); markDirty(); return;
    }
    if (chip?.dataset.templateId) { const template = byId(data.templates, chip.dataset.templateId); if (template) applyTemplate(task, template); return; }
    if (chip?.dataset.materialId) { const material = byId(data.materials, chip.dataset.materialId); if (material && !task.materials.some(item => searchKey(item.name) === searchKey(material.name))) { task.materials.push({ name: material.name, quantity: "", unit: "" }); markDirty(); renderTasks(); } return; }
    const customerChoice = event.target.closest("[data-customer-choice]");
    if (customerChoice) {
      const customer = byId(data.customers, customerChoice.dataset.customerChoice); if (!customer) return;
      task.customerId = customer.id; task.customerName = customer.name; task.address = customer.address || "";
      card.querySelector(".customer-input").value = task.customerName; card.querySelector(".address-input").value = task.address; card.querySelector(".customer-suggestions").hidden = true;
      updateTaskSummary(card, task, index); markDirty(); return;
    }
    if (event.target.closest(".customer-dropdown")) { showCustomerSuggestions(card, "", true); return; }
    if (event.target.closest(".add-customer")) { pendingCustomerTaskId = task.id; $("#customerForm").reset(); $("#customerDialog").showModal(); return; }
    if (event.target.closest(".add-material")) { task.materials.push({ name: "", quantity: "", unit: "" }); markDirty(); renderTasks(); return; }
    const materialRow = event.target.closest(".material-row");
    if (event.target.closest(".remove-material") && materialRow) { task.materials.splice(Number(materialRow.dataset.materialIndex), 1); markDirty(); renderTasks(); return; }
    if (event.target.closest(".duplicate-task")) { const duplicate = deepCopy(task); duplicate.id = uid(); workingPlan.tasks.splice(index + 1, 0, duplicate); markDirty(); renderTasks(); return; }
    if (event.target.closest(".remove-task")) { if (confirm("Eltávolítod ezt a napi feladatot?")) { workingPlan.tasks.splice(index, 1); activeTaskId = workingPlan.tasks[Math.min(index, workingPlan.tasks.length - 1)]?.id || null; markDirty(); renderTasks(); } return; }
    if (event.target.closest(".move-up") && index > 0) { [workingPlan.tasks[index - 1], workingPlan.tasks[index]] = [workingPlan.tasks[index], workingPlan.tasks[index - 1]]; markDirty(); renderTasks(); return; }
    if (event.target.closest(".move-down") && index < workingPlan.tasks.length - 1) { [workingPlan.tasks[index + 1], workingPlan.tasks[index]] = [workingPlan.tasks[index], workingPlan.tasks[index + 1]]; markDirty(); renderTasks(); }
  });
  $("#taskList").addEventListener("input", event => {
    const card = event.target.closest(".task-card"); if (!card) return; const task = findTaskFromElement(card); if (!task) return;
    if (event.target.matches(".customer-input")) { task.customerId = null; task.customerName = event.target.value; showCustomerSuggestions(card, event.target.value); }
    else if (event.target.matches(".address-input")) task.address = event.target.value;
    else if (event.target.matches(".title-input")) task.title = event.target.value;
    else if (event.target.matches(".extra-tools-input")) task.extraTools = event.target.value;
    else if (event.target.matches(".steps-input")) task.steps = event.target.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    else if (event.target.matches(".notes-input")) task.notes = event.target.value;
    else if (event.target.closest(".material-row")) {
      const row = event.target.closest(".material-row"); const material = task.materials[Number(row.dataset.materialIndex)];
      if (event.target.matches(".material-name")) material.name = event.target.value;
      if (event.target.matches(".material-quantity")) material.quantity = event.target.value;
      if (event.target.matches(".material-unit")) material.unit = event.target.value;
    }
    updateTaskSummary(card, task, workingPlan.tasks.indexOf(task)); markDirty();
  });
  $("#taskList").addEventListener("focusin", event => { const card = event.target.closest(".task-card"); if (card) setActiveTask(card, findTaskFromElement(card)); if (event.target.matches(".customer-input") && searchKey(event.target.value).length >= 2) showCustomerSuggestions(card, event.target.value); });
  document.addEventListener("click", event => { if (!event.target.closest(".customer-picker")) document.querySelectorAll(".customer-suggestions").forEach(box => box.hidden = true); });

  function addTask() { const task = blankTask(); workingPlan.tasks.push(task); activeTaskId = task.id; markDirty(); renderTasks(); $("#taskList .task-card:last-child")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  $("#addTaskButton").addEventListener("click", addTask);
  $("#addTaskBottomButton").addEventListener("click", addTask);
  $("#customerForm").addEventListener("submit", event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("name") || "").trim(); const address = String(form.get("address") || "").trim();
    if (!name || !address) return;
    const duplicate = data.customers.find(customer => searchKey(customer.name) === searchKey(name) && searchKey(customer.address) === searchKey(address));
    const customer = duplicate || { id: uid(), name, address, active: true, order: data.customers.length };
    if (!duplicate) data.customers.push(customer);
    const task = workingPlan.tasks.find(item => item.id === pendingCustomerTaskId);
    if (task) { task.customerId = customer.id; task.customerName = customer.name; task.address = customer.address; }
    markDirty("Ügyfél hozzáadva • mentés szükséges"); renderTasks(); $("#customerDialog").close();
  });

  function copyPlanFrom(date) {
    const source = data.plans.find(plan => plan.date === date);
    if (!source) { toast("Ehhez a dátumhoz nincs elmentett napi terv.", true); return; }
    workingPlan = deepCopy(source); workingPlan.id = uid(); workingPlan.date = $("#planDate").value;
    workingPlan.tasks.forEach(task => task.id = uid()); markDirty("Korábbi terv másolva • mentés szükséges"); renderTasks(); toast("A terv átmásolva az új dátumra.");
  }
  $("#copyYesterdayButton").addEventListener("click", () => copyPlanFrom(dateOffset(workingPlan.date, -1)));
  $("#copyEarlierButton").addEventListener("click", () => {
    const plans = data.plans.filter(plan => plan.date !== workingPlan.date).sort((a, b) => b.date.localeCompare(a.date));
    $("#historyList").innerHTML = plans.length ? plans.map(plan => `<button class="history-item" type="button" data-copy-date="${plan.date}"><span><b>${escapeHTML(formatDate(plan.date))}</b><span>${plan.tasks.length} feladat</span></span><strong>Másolás →</strong></button>`).join("") : `<p>Még nincs másolható korábbi terv.</p>`;
    $("#historyDialog").showModal();
  });
  $("#historyList").addEventListener("click", event => { const item = event.target.closest("[data-copy-date]"); if (item) { copyPlanFrom(item.dataset.copyDate); $("#historyDialog").close(); } });

  function renderWeek() {
    const start = startOfWeek(weekAnchor); const days = Array.from({ length: 7 }, (_, index) => dateOffset(start, index));
    $("#weekRange").textContent = `${formatDate(days[0], { year: "numeric", month: "long", day: "numeric" })} – ${formatDate(days[6], { year: "numeric", month: "long", day: "numeric" })}`;
    $("#weekGrid").innerHTML = days.map(date => {
      const plan = data.plans.find(item => item.date === date); const tasks = plan?.tasks || [];
      const taskHTML = tasks.length ? tasks.map((task, index) => {
        const workers = task.workerIds.map(id => byId(data.workers, id)?.name).filter(Boolean).join(", ");
        const vehicles = task.vehicleIds.map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ");
        return `<div class="week-task"><b>${index + 1}. ${escapeHTML(vehicles || "Autó nélkül")}</b><small class="week-workers">Dolgozók: ${escapeHTML(workers || "nincs kiválasztva")}</small><span><strong>${escapeHTML(task.customerName || "Ügyfél nélkül")}</strong>${task.address ? `<em>${escapeHTML(task.address)}</em>` : ""}</span></div>`;
      }).join("") : `<p class="week-empty">Nincs elmentett feladat.</p>`;
      return `<article class="week-day${date === isoToday() ? " today" : ""}"><header><p class="week-day-name">${escapeHTML(formatDate(date, { weekday: "long" }))}</p><p class="week-day-date">${escapeHTML(formatDate(date, { month: "short", day: "numeric" }))}</p></header><div class="week-day-tasks">${taskHTML}</div><button class="week-open" type="button" data-open-date="${date}">${tasks.length ? "Nap megnyitása" : "Terv készítése"}</button></article>`;
    }).join("");
  }
  function switchView(view) {
    const weekly = view === "week"; $("#dayView").hidden = weekly; $("#weekView").hidden = !weekly; document.body.classList.toggle("week-mode", weekly);
    setDockOpen(false);
    $("#dayViewButton").classList.toggle("active", !weekly); $("#dayViewButton").setAttribute("aria-pressed", String(!weekly));
    $("#weekViewButton").classList.toggle("active", weekly); $("#weekViewButton").setAttribute("aria-pressed", String(weekly));
    if (weekly) { if (dirty) upsertWorkingPlan(); renderWeek(); }
  }
  $("#dayViewButton").addEventListener("click", () => switchView("day")); $("#weekViewButton").addEventListener("click", () => switchView("week"));
  $("#weekGrid").addEventListener("click", event => { const button = event.target.closest("[data-open-date]"); if (!button) return; loadPlan(button.dataset.openDate); switchView("day"); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("#previousWeekButton").addEventListener("click", () => { weekAnchor = dateOffset(weekAnchor, -7); renderWeek(); });
  $("#nextWeekButton").addEventListener("click", () => { weekAnchor = dateOffset(weekAnchor, 7); renderWeek(); });
  $("#currentWeekButton").addEventListener("click", () => { weekAnchor = isoToday(); renderWeek(); });

  function planText() {
    const lines = [`${formatDate(workingPlan.date)} – Napi feladatok`, ""];
    if (workingPlan.meeting) lines.push(`Találkozó: ${workingPlan.meeting}`);
    if (workingPlan.stops) lines.push(`Megálló: ${workingPlan.stops}`);
    if (workingPlan.meeting || workingPlan.stops) lines.push("");
    workingPlan.tasks.forEach((task, index) => {
      const workers = task.workerIds.map(id => byId(data.workers, id)?.name).filter(Boolean).join(", ");
      const vehicles = task.vehicleIds.map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ");
      const tools = [...task.toolIds.map(id => byId(data.tools, id)?.name).filter(Boolean), ...String(task.extraTools || "").split(",").map(item => item.trim()).filter(Boolean)];
      lines.push(`${index + 1}. ${vehicles || "Autó nélkül"}`);
      lines.push(`Dolgozók: ${workers || "nincs kiválasztva"}`);
      lines.push(`Ügyfél: ${task.customerName || "nincs kiválasztva"}`);
      lines.push(`Cím: ${task.address || "nincs megadva"}`);
      if (task.title) lines.push(`Feladat: ${task.title}`);
      if (tools.length) { lines.push("Eszközök:"); tools.forEach(item => lines.push(`- ${item}`)); }
      const materials = task.materials.filter(item => item.name);
      if (materials.length) { lines.push("Anyagok:"); materials.forEach(item => lines.push(`- ${item.name}${item.quantity ? ` – ${item.quantity}` : ""}${item.unit ? ` ${item.unit}` : ""}`)); }
      if (task.steps.length) { lines.push("Munkamenet:"); task.steps.forEach((step, stepIndex) => lines.push(`${stepIndex + 1}. ${step.replace(/^\d+[.)]\s*/, "")}`)); }
      if (task.notes) lines.push(`Megjegyzés: ${task.notes}`); lines.push("");
    });
    lines.push(FINAL_NOTE); return lines.join("\n");
  }
  function renderPrintView() {
      const tasks = workingPlan.tasks.map((task, index) => {
      const workers = task.workerIds.map(id => byId(data.workers, id)).filter(Boolean).map(worker => `<span class="print-worker" style="--print-worker-color:${escapeHTML(worker.color)};--print-worker-text:${bestTextColor(worker.color)}">${escapeHTML(worker.name)}</span>`).join("");
      const vehicles = task.vehicleIds.map(id => byId(data.vehicles, id)?.name).filter(Boolean).join(" + ");
      const tools = [...task.toolIds.map(id => byId(data.tools, id)?.name).filter(Boolean), ...String(task.extraTools || "").split(",").map(item => item.trim()).filter(Boolean)];
      const materials = task.materials.filter(item => item.name);
      return `${index ? `<div class="print-divider">Következő napi feladat</div>` : ""}<article class="print-task"><div class="print-task-heading"><span class="print-index">${index + 1}.</span><h2>${escapeHTML(vehicles || "Autó nélkül")}</h2></div><div class="print-team-line"><strong>Dolgozók:</strong> ${workers || `<span>Nincs kiválasztva</span>`}</div><div class="print-client-row"><section><small>Ügyfél</small><strong>${escapeHTML(task.customerName || "Nincs kiválasztva")}</strong></section><section><small>Cím</small><strong>${escapeHTML(task.address || "Nincs megadva")}</strong></section></div><div class="print-grid">${task.title ? `<section class="print-section wide"><h3>Feladat</h3><p><strong>${escapeHTML(task.title)}</strong></p></section>` : ""}${tools.length ? `<section class="print-section"><h3>Szükséges eszközök</h3><ul>${tools.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></section>` : ""}${materials.length ? `<section class="print-section"><h3>Anyagok</h3><ul>${materials.map(item => `<li>${escapeHTML(item.name)}${item.quantity ? ` – ${escapeHTML(item.quantity)}` : ""}${item.unit ? ` ${escapeHTML(item.unit)}` : ""}</li>`).join("")}</ul></section>` : ""}${task.steps.length ? `<section class="print-section wide"><h3>Feladat / munkamenet</h3><ol>${task.steps.map(step => `<li>${escapeHTML(step.replace(/^\d+[.)]\s*/, ""))}</li>`).join("")}</ol></section>` : ""}${task.notes ? `<section class="print-section wide"><h3>Megjegyzés</h3><p>${escapeHTML(task.notes)}</p></section>` : ""}</div></article>`;
    }).join("");
    const departure = workingPlan.meeting || workingPlan.stops ? `<div class="print-departure">${workingPlan.meeting ? `<p><strong>Találkozó:</strong> ${escapeHTML(workingPlan.meeting)}</p>` : ""}${workingPlan.stops ? `<p><strong>Megálló:</strong> ${escapeHTML(workingPlan.stops)}</p>` : ""}</div>` : "";
    $("#printView").innerHTML = `<div class="print-sheet"><header class="print-header"><img src="assets/diszkertek-logo.png" alt="Díszkertek"><div><div class="print-brand">Díszkertek – Minden, ami kerttel kapcsolatos</div><h1>Napi feladatok</h1><div class="print-date">${escapeHTML(formatDate(workingPlan.date))}</div></div></header>${departure}${tasks || `<p>Nincs feladat erre a napra.</p>`}<div class="print-footer-note">${FINAL_NOTE}</div><footer class="print-document-footer">Díszkertek • Napi feladatok</footer></div>`;
  }
  $("#printButton").addEventListener("click", () => { renderPrintView(); window.print(); });
  async function copyText() {
    const text = planText();
    try { await navigator.clipboard.writeText(text); toast("A napi terv szövege a vágólapra került."); }
    catch (_) { const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove(); toast("A napi terv szövege a vágólapra került."); }
  }
  $("#copyTextButton").addEventListener("click", copyText);
  $("#shareButton").addEventListener("click", async () => {
    if (!navigator.share) { await copyText(); return; }
    try { await navigator.share({ title: `${workingPlan.date} – Napi feladatok`, text: planText() }); }
    catch (error) { if (error?.name !== "AbortError") { await copyText(); toast("A megosztás helyett a szöveget a vágólapra másoltam."); } }
  });

  function settingsType() {
    return activeSettingsTab === "workers" ? data.workers : activeSettingsTab === "vehicles" ? data.vehicles : activeSettingsTab === "tools" ? data.tools : activeSettingsTab === "materials" ? data.materials : activeSettingsTab === "templates" ? data.templates : data.customers;
  }
  function renderSettings() {
    document.querySelectorAll("[data-settings-tab]").forEach(button => button.classList.toggle("active", button.dataset.settingsTab === activeSettingsTab));
    const container = $("#settingsContent");
    if (activeSettingsTab === "data") {
      container.innerHTML = `<div class="settings-editor"><h3>Helyi adatfájl</h3><p>Az alkalmazás minden adatot a <strong>${DATA_FILE_NAME}</strong> fájlba ment. Érdemes erről időnként biztonsági másolatot készíteni.</p><div class="fallback-actions"><button class="btn btn-outline-green" type="button" data-data-action="choose">Mappa kiválasztása</button><button class="btn btn-soft" type="button" data-data-action="download">Biztonsági másolat letöltése</button><label class="btn btn-soft mb-0">Másolat visszatöltése<input type="file" data-data-import accept="application/json,.json" hidden></label></div></div>`;
      return;
    }
    const list = settingsType(); const editing = list.find(item => item.id === editingSettingsId);
    if (activeSettingsTab === "workers") {
      const selectedColor = validWorkerColor(editing?.color);
      const palette = workerPalette.map(color => `<button class="worker-color-choice" type="button" data-worker-color="${color}" style="--choice-color:${color}" aria-label="${color} szín" aria-pressed="${color === selectedColor}"><span></span></button>`).join("");
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? "Dolgozó szerkesztése" : "Új dolgozó"}</h3><div class="form-grid"><label>Név<input class="form-control" id="settingName" value="${escapeHTML(editing?.name || "")}" maxlength="80"></label><fieldset class="worker-color-editor wide"><legend>Dolgozó színe</legend><div class="worker-color-palette">${palette}</div><label class="worker-custom-color"><span>Egyedi szín</span><input id="settingColor" type="color" value="${selectedColor}"><output id="settingColorCode">${selectedColor.toUpperCase()}</output></label></fieldset><label class="wide"><span><input id="settingManager" type="checkbox" ${editing?.manager ? "checked" : ""}> Munkavezető</span></label></div><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list, item => item.manager ? "Munkavezető" : "Dolgozó", true)}`;
    } else if (activeSettingsTab === "vehicles" || activeSettingsTab === "tools" || activeSettingsTab === "materials") {
      const title = activeSettingsTab === "vehicles" ? "autó" : activeSettingsTab === "tools" ? "eszköz" : "anyag";
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? `${title[0].toUpperCase() + title.slice(1)} szerkesztése` : `Új ${title}`}</h3><label>Név<input class="form-control" id="settingName" value="${escapeHTML(editing?.name || "")}" maxlength="100"></label><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list)}`;
    } else if (activeSettingsTab === "customers") {
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? "Ügyfél szerkesztése" : "Új ügyfél"}</h3><div class="form-grid"><label>Név<input class="form-control" id="settingName" value="${escapeHTML(editing?.name || "")}" maxlength="120"></label><label>Cím<input class="form-control" id="settingAddress" value="${escapeHTML(editing?.address || "")}" maxlength="240"></label></div><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list, item => item.address || "Nincs megadott cím")}`;
    } else {
      const template = editing || { name: "", toolIds: [], materials: [], steps: [] };
      const toolNames = template.toolIds.map(id => byId(data.tools, id)?.name).filter(Boolean).join(", ");
      const materialLines = template.materials.map(item => [item.name, item.quantity, item.unit].join(" | ")).join("\n");
      container.innerHTML = `<div class="settings-editor"><h3>${editing ? "Sablon szerkesztése" : "Új feladatsablon"}</h3><label>Név<input class="form-control" id="settingName" value="${escapeHTML(template.name)}" maxlength="120"></label><label>Eszközök vesszővel elválasztva<input class="form-control" id="settingTools" value="${escapeHTML(toolNames)}" placeholder="például: lapát, gereblye"></label><label>Anyagok – soronként: név | mennyiség | egység<textarea class="form-control" id="settingMaterials" rows="3">${escapeHTML(materialLines)}</textarea></label><label>Munkamenet – soronként egy lépés<textarea class="form-control" id="settingSteps" rows="5">${escapeHTML(template.steps.join("\n"))}</textarea></label><button class="btn btn-outline-green" type="button" data-setting-submit>Mentés</button></div>${settingsListHTML(list, item => `${item.steps?.length || 0} lépés • ${item.toolIds?.length || 0} eszköz`)}`;
    }
  }
  function settingsListHTML(list, description = () => "", showWorkerColor = false) {
    const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "hu"));
    return `<div class="settings-list">${sorted.map(item => {
      const color = validWorkerColor(item.color);
      return `<div class="settings-row${item.active === false ? " inactive" : ""}"><div class="settings-item-copy">${showWorkerColor ? `<span class="worker-list-color" style="--worker-list-color:${color}" aria-hidden="true"></span>` : ""}<span><strong>${escapeHTML(item.name)}</strong><p>${escapeHTML(description(item))}${showWorkerColor ? ` • ${color.toUpperCase()}` : ""}</p></span></div><div class="settings-row-actions"><button class="icon-button" type="button" data-setting-edit="${item.id}" aria-label="Szerkesztés">✎</button><button class="icon-button${item.active === false ? "" : " danger"}" type="button" data-setting-toggle="${item.id}" aria-label="${item.active === false ? "Aktiválás" : "Inaktiválás"}">${item.active === false ? "↺" : "×"}</button></div></div>`;
    }).join("")}</div>`;
  }
  function setWorkerColor(color) {
    const normalized = validWorkerColor(color); const input = $("#settingColor"); const output = $("#settingColorCode");
    if (input) input.value = normalized; if (output) output.value = normalized.toUpperCase();
    document.querySelectorAll("[data-worker-color]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.workerColor === normalized)));
  }
  function saveSettingEditor() {
    const list = settingsType(); const existing = list.find(item => item.id === editingSettingsId); const name = $("#settingName")?.value.trim(); if (!name) { toast("A név megadása kötelező.", true); return; }
    const item = existing || { id: uid(), active: true, order: list.length };
    item.name = name;
    if (activeSettingsTab === "workers") { item.color = $("#settingColor").value; item.manager = $("#settingManager").checked; }
    if (activeSettingsTab === "customers") item.address = $("#settingAddress").value.trim();
    if (activeSettingsTab === "templates") {
      const names = $("#settingTools").value.split(",").map(value => value.trim()).filter(Boolean);
      item.toolIds = names.map(nameValue => {
        let tool = data.tools.find(entry => searchKey(entry.name) === searchKey(nameValue));
        if (!tool) { tool = { id: uid(), name: nameValue, active: true, order: data.tools.length }; data.tools.push(tool); }
        return tool.id;
      });
      item.materials = $("#settingMaterials").value.split(/\r?\n/).map(line => line.split("|").map(value => value.trim())).filter(parts => parts[0]).map(([materialName, quantity = "", unit = ""]) => ({ name: materialName, quantity, unit }));
      item.steps = $("#settingSteps").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    }
    if (!existing) list.push(item); editingSettingsId = null; markDirty("Beállítás módosítva • mentés szükséges"); renderSettings(); renderTasks();
  }
  $("#settingsButton").addEventListener("click", () => { activeSettingsTab = "workers"; editingSettingsId = null; renderSettings(); $("#settingsDialog").showModal(); });
  $("#settingsDialog").addEventListener("click", event => {
    const tab = event.target.closest("[data-settings-tab]"); if (tab) { activeSettingsTab = tab.dataset.settingsTab; editingSettingsId = null; renderSettings(); return; }
    const colorChoice = event.target.closest("[data-worker-color]"); if (colorChoice) { setWorkerColor(colorChoice.dataset.workerColor); return; }
    if (event.target.closest("[data-setting-submit]")) { saveSettingEditor(); return; }
    const edit = event.target.closest("[data-setting-edit]"); if (edit) { editingSettingsId = edit.dataset.settingEdit; renderSettings(); return; }
    const toggle = event.target.closest("[data-setting-toggle]"); if (toggle) { const item = settingsType().find(entry => entry.id === toggle.dataset.settingToggle); if (item) { item.active = item.active === false; markDirty("Beállítás módosítva • mentés szükséges"); renderSettings(); renderTasks(); } return; }
    const dataAction = event.target.closest("[data-data-action]"); if (dataAction?.dataset.dataAction === "choose") chooseFolder(); if (dataAction?.dataset.dataAction === "download") downloadData();
  });
  $("#settingsDialog").addEventListener("input", event => { if (event.target.matches("#settingColor")) setWorkerColor(event.target.value); });
  $("#settingsDialog").addEventListener("change", event => { if (event.target.matches("[data-data-import]")) importDataFile(event.target.files[0]); });
  $("#settingsSaveButton").addEventListener("click", async event => { event.preventDefault(); try { if (await writeDataFile()) $("#settingsDialog").close(); } catch (error) { $("#saveState").textContent = "Mentési hiba"; toast(`A mentés nem sikerült: ${readableError(error)}`, true); } });

  $("#planDate").addEventListener("change", event => changeDate(event.target.value));
  $("#meetingInput").addEventListener("input", event => { workingPlan.meeting = event.target.value; markDirty(); });
  $("#stopsInput").addEventListener("input", event => { workingPlan.stops = event.target.value; markDirty(); });
  $("#todayButton").addEventListener("click", () => changeDate(isoToday()));
  $("#folderButton").addEventListener("click", chooseFolder); $("#refreshButton").addEventListener("click", refreshFromFile);
  $("#downloadButton").addEventListener("click", () => {
    $("#downloadReference").textContent = `A heti, havi és éves mentés alapdátuma: ${formatDate(workingPlan.date)}.`;
    $("#downloadsDialog").showModal();
  });
  $("#downloadsDialog").addEventListener("click", event => { const button = event.target.closest("[data-export-period]"); if (button) exportPeriod(button.dataset.exportPeriod); });
  function appRunsStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function mobilePlatform() {
    const agent = navigator.userAgent || "";
    if (/iphone|ipad|ipod/i.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
    if (/android/i.test(agent)) return "android";
    return "desktop";
  }
  function showInstallHelp() {
    const platform = mobilePlatform();
    const content = platform === "ios"
      ? `<p class="install-help-intro">iPhone vagy iPad készüléken a Safari böngészőből telepíthető:</p><ol class="install-steps"><li>Nyisd meg ezt az oldalt <strong>Safariban</strong>.</li><li>Koppints alul a <strong>Megosztás</strong> ikonra.</li><li>Válaszd a <strong>Főképernyőhöz adás</strong> lehetőséget.</li><li>Koppints a <strong>Hozzáadás</strong> gombra.</li></ol>`
      : platform === "android"
        ? `<p class="install-help-intro">Android telefonon a Chrome böngészőből telepíthető:</p><ol class="install-steps"><li>Nyisd meg ezt az oldalt <strong>Chrome-ban</strong>.</li><li>Koppints a jobb felső sarokban a <strong>⋮ menüre</strong>.</li><li>Válaszd az <strong>Alkalmazás telepítése</strong> vagy a <strong>Hozzáadás a főképernyőhöz</strong> lehetőséget.</li><li>Erősítsd meg a telepítést.</li></ol>`
        : `<p class="install-help-intro">A böngésző menüjéből telepítheted az alkalmazást:</p><ol class="install-steps"><li>Nyisd meg a böngésző főmenüjét.</li><li>Válaszd az <strong>Alkalmazás telepítése</strong> lehetőséget.</li><li>Erősítsd meg a telepítést.</li></ol>`;
    $("#installHelpContent").innerHTML = `${content}<p class="install-help-note">A ZIP-fájlt nem kell telefonon megnyitni. A telepített app a főképernyőről indul és internet nélkül is megnyitható.</p>`;
    $("#downloadsDialog").close(); $("#installHelpDialog").showModal();
  }
  $("#installAppButton").addEventListener("click", async () => {
    if (appRunsStandalone()) { toast("Az alkalmazás már telepítve van ezen az eszközön."); return; }
    if (!installPrompt) { showInstallHelp(); return; }
    await installPrompt.prompt(); const choice = await installPrompt.userChoice; installPrompt = null;
    if (choice.outcome !== "accepted") showInstallHelp();
  });
  $("#saveButton").addEventListener("click", async () => { try { if (!(await writeDataFile()) && !("showDirectoryPicker" in window)) $("#fileFallbackDialog").showModal(); } catch (error) { $("#saveState").textContent = "Mentési hiba"; toast(`A mentés nem sikerült: ${readableError(error)}`, true); } });
  $("#downloadDataButton").addEventListener("click", downloadData); $("#openDataInput").addEventListener("change", event => importDataFile(event.target.files[0]));
  window.addEventListener("beforeunload", event => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; });
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; $("#installAppHint").textContent = "A telepítés készen áll – koppints ide"; });
  window.addEventListener("appinstalled", () => { installPrompt = null; $("#installAppHint").textContent = "Az app telepítve van ezen az eszközön"; toast("A Napi feladatok app telepítése sikerült."); });

  async function initialize() {
    $("#planDate").value = isoToday();
    try {
      if ("showDirectoryPicker" in window) {
        const stored = await readStoredDirectoryHandle();
        if (stored && await hasWritePermission(stored, false)) { directoryHandle = stored; const loaded = await readDataFile(stored); if (loaded) data = loaded; }
      }
    } catch (_) { directoryHandle = null; }
    if (!directoryHandle) {
      try {
        const recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY));
        if (recovery?.data && confirm("Találtam egy korábban félbehagyott, nem mentett tervet. Visszaállítsam?")) {
          data = normalizeData(recovery.data); workingPlan = recovery.workingPlan || blankPlan(isoToday());
          workingPlan.meeting = typeof workingPlan.meeting === "string" ? workingPlan.meeting : DEFAULT_MEETING;
          workingPlan.stops = typeof workingPlan.stops === "string" ? workingPlan.stops : DEFAULT_STOPS;
          $("#planDate").value = workingPlan.date; $("#meetingInput").value = workingPlan.meeting; $("#stopsInput").value = workingPlan.stops; dirty = true;
        }
      } catch (_) { /* Hibás helyreállítási adatot figyelmen kívül hagyunk. */ }
    }
    updateStorageStatus();
    if (!dirty) loadPlan($("#planDate").value); else { renderTasks(); $("#saveState").textContent = "Helyreállított piszkozat • mentés szükséges"; }
    if (appRunsStandalone()) $("#installAppHint").textContent = "Az app telepítve van ezen az eszközön";
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  initialize();
})();
