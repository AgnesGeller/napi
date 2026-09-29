((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NapiDomain = api;
})(typeof window === "undefined" ? globalThis : window, () => {
  "use strict";

  const escapeHTML = value => String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

  function renderWorkItemsHTML(items, types) {
    return (items || []).map(item => {
      const type = types[item.type] || types.work;
      return `<article class="work-inbox-item" data-work-item-id="${escapeHTML(item.id)}" style="--work-type-color:${escapeHTML(type.color)}"><span class="work-inbox-type">${escapeHTML(type.label)}</span><div class="work-inbox-copy"><strong>${escapeHTML(item.customerName || "Nincs megadva")}</strong><span>${escapeHTML(item.address || "Nincs megadott cím")}</span>${item.note ? `<small>${escapeHTML(item.note)}</small>` : ""}</div><div class="work-inbox-actions">${item.type === "work" ? `<button class="btn btn-outline-green work-assign" type="button">Kiosztás</button>` : ""}<button class="btn btn-soft work-edit" type="button">Szerkesztés</button><button class="btn work-remove" type="button">Törlés</button></div></article>`;
    }).join("");
  }

  function printWorkItemsHTML(items, types) {
    if (!(items || []).length) return "";
    const rows = items.map(item => {
      const type = types[item.type] || types.work;
      return `<article class="print-work-item"><strong>${escapeHTML(type.label)}: ${escapeHTML(item.customerName || "Nincs megadva")}</strong><span>${escapeHTML(item.address || "Nincs megadott cím")}</span>${item.note ? `<small>${escapeHTML(item.note)}</small>` : ""}</article>`;
    }).join("");
    return `<section class="print-work-items"><h2>Előjegyzések</h2>${rows}</section>`;
  }

  function planHasPrintableContent(plan) {
    return Boolean(plan && ((Array.isArray(plan.tasks) && plan.tasks.length) || (Array.isArray(plan.workItems) && plan.workItems.length)));
  }

  function mergeWorkItems(existingItems, incomingItems, deletedIds = []) {
    const deleted = new Set(deletedIds);
    const merged = new Map();
    (existingItems || []).forEach(item => { if (item?.id && !deleted.has(item.id)) merged.set(item.id, item); });
    (incomingItems || []).forEach(item => { if (item?.id && !deleted.has(item.id)) merged.set(item.id, item); });
    return [...merged.values()];
  }

  function mergePendingWorkItems(remotePlan, localPlan) {
    const deletedWorkItemIds = [...new Set([...(remotePlan?.deletedWorkItemIds || []), ...(localPlan?.deletedWorkItemIds || [])])];
    return {
      ...remotePlan,
      workItems: mergeWorkItems(remotePlan?.workItems, localPlan?.workItems, deletedWorkItemIds),
      deletedWorkItemIds
    };
  }

  function applyImportedData(currentData, incomingData, partial) {
    const previousByDate = new Map((currentData.plans || []).map(plan => [plan.date, plan]));
    const importedPlans = (incomingData.plans || []).map(plan => ({
      ...plan,
      cloudUpdatedAt: plan.cloudUpdatedAt || previousByDate.get(plan.date)?.cloudUpdatedAt || ""
    }));
    if (partial) {
      const merged = new Map((currentData.plans || []).map(plan => [plan.date, plan]));
      importedPlans.forEach(plan => merged.set(plan.date, plan));
      return {
        data: { ...currentData, plans: [...merged.values()].sort((a, b) => b.date.localeCompare(a.date)) },
        planDates: importedPlans.map(plan => plan.date),
        deletedDates: [],
        configChanged: false
      };
    }
    const importedDates = new Set(importedPlans.map(plan => plan.date));
    return {
      data: { ...incomingData, plans: importedPlans.sort((a, b) => b.date.localeCompare(a.date)) },
      planDates: importedPlans.map(plan => plan.date),
      deletedDates: (currentData.plans || []).map(plan => plan.date).filter(date => !importedDates.has(date)),
      configChanged: true
    };
  }

  function configChangeEffects(currentData, updatedAt) {
    return {
      data: { ...currentData, updatedAt },
      configPending: true,
      planDates: []
    };
  }

  function persistImportedData(storage, key, currentData, incomingData, partial) {
    const result = applyImportedData(currentData, incomingData, partial);
    storage.setItem(key, JSON.stringify(result.data));
    return result;
  }

  return { applyImportedData, configChangeEffects, mergePendingWorkItems, mergeWorkItems, persistImportedData, planHasPrintableContent, printWorkItemsHTML, renderWorkItemsHTML };
});
