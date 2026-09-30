((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NapiDomain = api;
})(typeof window === "undefined" ? globalThis : window, () => {
  "use strict";

  const escapeHTML = value => String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  const CONFIG_COLLECTIONS = ["workers", "vehicles", "tools", "materials", "templates", "customers", "recurrences"];

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

  function resolvePlanConflict(remoteRow, localPlan, hasLocalContent) {
    const remotePayload = remoteRow?.payload;
    if (!remotePayload || typeof remotePayload !== "object") return { action: "accept-remote", plan: null };
    if (!remotePayload.deleted) return { action: "accept-remote", plan: remotePayload };

    const deletedPlanId = String(remotePayload.deletedPlanId || "");
    const localPlanId = String(localPlan?.id || "");
    const isNewPlanAfterDeletion = Boolean(hasLocalContent && deletedPlanId && localPlanId && localPlanId !== deletedPlanId);
    if (!isNewPlanAfterDeletion) return { action: "accept-remote", plan: null };

    return {
      action: "retry-from-remote-version",
      plan: { ...localPlan, cloudUpdatedAt: remoteRow.updated_at || "" }
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

  function configChangesBetween(previous, next, { deleteMissing = false } = {}) {
    const changes = [];
    CONFIG_COLLECTIONS.forEach(collection => {
      const before = new Map((previous?.[collection] || []).filter(item => item?.id).map(item => [item.id, item]));
      const after = new Map((next?.[collection] || []).filter(item => item?.id).map(item => [item.id, item]));
      after.forEach((value, id) => {
        if (JSON.stringify(before.get(id)) !== JSON.stringify(value)) changes.push({ collection, id, value });
      });
      if (deleteMissing) before.forEach((_value, id) => {
        if (!after.has(id)) changes.push({ collection, id, deleted: true });
      });
    });
    return changes;
  }

  function applyConfigChanges(config, changes) {
    const result = JSON.parse(JSON.stringify(config || {}));
    CONFIG_COLLECTIONS.forEach(collection => { if (!Array.isArray(result[collection])) result[collection] = []; });
    (changes || []).forEach(change => {
      if (!CONFIG_COLLECTIONS.includes(change.collection) || !change.id) return;
      const list = result[change.collection];
      const index = list.findIndex(item => item?.id === change.id);
      if (change.deleted) { if (index >= 0) list.splice(index, 1); return; }
      if (!change.value || typeof change.value !== "object") return;
      if (index >= 0) list[index] = JSON.parse(JSON.stringify(change.value));
      else list.push(JSON.parse(JSON.stringify(change.value)));
    });
    return result;
  }

  function mergeConfigChangeQueue(queue, changes) {
    const merged = new Map((queue || []).map(change => [`${change.collection}:${change.id}`, change]));
    (changes || []).forEach(change => {
      if (!CONFIG_COLLECTIONS.includes(change.collection) || !change.id) return;
      const key = `${change.collection}:${change.id}`;
      const previous = merged.get(key);
      merged.set(key, { ...change, base_revision: previous?.base_revision ?? change.base_revision ?? null });
    });
    return [...merged.values()];
  }

  function removeAcknowledgedConfigChanges(queue, sent) {
    const acknowledgements = new Map((sent || []).map(change => [`${change.collection}:${change.id}`, JSON.stringify(change)]));
    return (queue || []).filter(change => acknowledgements.get(`${change.collection}:${change.id}`) !== JSON.stringify(change));
  }

  function reconcileConfigChangeQueue(queue, sent, conflicts, revisions) {
    const sentKeys = new Set((sent || []).map(change => `${change.collection}:${change.id}`));
    const conflictKeys = new Set((conflicts || []).map(change => `${change.collection}:${change.id}`));
    return removeAcknowledgedConfigChanges(queue, sent).flatMap(change => {
      const key = `${change.collection}:${change.id}`;
      if (!sentKeys.has(key)) return [change];
      if (conflictKeys.has(key)) return [];
      return [{ ...change, base_revision: revisions?.[change.collection]?.[change.id] || null }];
    });
  }

  function persistImportedData(storage, key, currentData, incomingData, partial) {
    const result = applyImportedData(currentData, incomingData, partial);
    storage.setItem(key, JSON.stringify(result.data));
    return result;
  }

  return { applyConfigChanges, applyImportedData, configChangeEffects, configChangesBetween, mergeConfigChangeQueue, mergePendingWorkItems, mergeWorkItems, persistImportedData, planHasPrintableContent, printWorkItemsHTML, reconcileConfigChangeQueue, removeAcknowledgedConfigChanges, renderWorkItemsHTML, resolvePlanConflict };
});
