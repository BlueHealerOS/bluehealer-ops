import type { GraphClient } from '../graph/client';
import { creationOrder, type Column, type ListDef } from '../schema/lists';

interface RemoteColumn { id: string; name: string; choice?: { choices?: string[] } }

export interface ListPlan {
  list: ListDef;
  listId?: string;
  create: boolean;
  missingColumns: Column[];
  missingChoices: { column: Column; remoteId: string; values: string[]; all: string[] }[];
}
export interface ProvisionPlan { siteId: string; lists: ListPlan[]; changes: number }

export function toGraphColumn(c: Column, listIds: Map<string, string>) {
  const base: Record<string, unknown> = { name: c.name, displayName: c.name, ...(c.indexed ? { indexed: true } : {}) };
  switch (c.type) {
    case 'text': return { ...base, text: { allowMultipleLines: false, ...(c.max ? { maxLength: c.max } : {}) } };
    case 'note': return { ...base, text: { allowMultipleLines: true, textType: 'plain' } };
    case 'number': return { ...base, number: {} };
    case 'boolean': return { ...base, boolean: {} };
    case 'date': return { ...base, dateTime: { format: 'dateOnly' } };
    case 'datetime': return { ...base, dateTime: { format: 'dateTime' } };
    case 'choice': return { ...base, choice: { allowTextEntry: false, choices: c.choices, displayAs: 'dropDownMenu' }, ...(c.default ? { defaultValue: { value: c.default } } : {}) };
    case 'multichoice': return { ...base, choice: { allowTextEntry: false, choices: c.choices, displayAs: 'checkBoxes' } };
    case 'lookup': {
      const id = listIds.get(c.lookup!);
      if (!id) throw new Error(`Lookup target ${c.lookup} not created yet for ${c.name}`);
      return { ...base, lookup: { columnName: 'Title', listId: id, allowMultipleValues: false } };
    }
    case 'url': return { ...base, hyperlinkOrPicture: { isPicture: false } };
  }
}

/** Read-only comparison of the schema with the site. Safe to run any number of times. */
export async function planProvision(client: GraphClient, siteId: string, lists: ListDef[]): Promise<ProvisionPlan> {
  const remote = await client.getAll<{ id: string; displayName: string }>(`/sites/${siteId}/lists?$select=id,displayName&$top=100`);
  const byName = new Map(remote.map((l) => [l.displayName, l.id]));
  const plans: ListPlan[] = [];
  let changes = 0;
  for (const list of creationOrder(lists)) {
    const listId = byName.get(list.name);
    if (!listId) {
      plans.push({ list, create: true, missingColumns: list.columns, missingChoices: [] });
      changes += 1 + list.columns.length;
      continue;
    }
    const cols = await client.getAll<RemoteColumn>(`/sites/${siteId}/lists/${listId}/columns?$top=200`);
    const have = new Map(cols.map((c) => [c.name, c]));
    const missingColumns = list.columns.filter((c) => !have.has(c.name));
    const missingChoices: ListPlan['missingChoices'] = [];
    for (const c of list.columns) {
      const r = have.get(c.name);
      if (!r || !c.choices) continue;
      const existing = r.choice?.choices ?? [];
      const values = c.choices.filter((v) => !existing.includes(v));
      if (values.length) missingChoices.push({ column: c, remoteId: r.id, values, all: [...existing, ...values] });
    }
    plans.push({ list, listId, create: false, missingColumns, missingChoices });
    changes += missingColumns.length + missingChoices.length;
  }
  return { siteId, lists: plans, changes };
}

/** Create missing lists and columns, add missing choice values. Never deletes, renames or edits existing data. */
export async function applyProvision(client: GraphClient, plan: ProvisionPlan, log: (m: string) => void = () => {}): Promise<void> {
  const ids = new Map(plan.lists.filter((p) => p.listId).map((p) => [p.list.name, p.listId!]));
  for (const p of plan.lists) {
    const base = (id: string) => `/sites/${plan.siteId}/lists/${id}`;
    if (p.create) {
      const selfLookups = p.list.columns.filter((c) => c.type === 'lookup' && c.lookup === p.list.name);
      const columns = p.list.columns.filter((c) => !selfLookups.includes(c)).map((c) => toGraphColumn(c, ids));
      const made = await client.request<{ id: string }>('POST', `/sites/${plan.siteId}/lists`, {
        body: { displayName: p.list.name, description: p.list.description, list: { template: 'genericList' }, columns },
      });
      ids.set(p.list.name, made.id);
      log(`Created list ${p.list.name}`);
      for (const c of selfLookups) {
        await client.request('POST', `${base(made.id)}/columns`, { body: toGraphColumn(c, ids) });
        log(`Added column ${p.list.name}.${c.name}`);
      }
      continue;
    }
    const id = p.listId!;
    for (const c of p.missingColumns) {
      await client.request('POST', `${base(id)}/columns`, { body: toGraphColumn(c, ids) });
      log(`Added column ${p.list.name}.${c.name}`);
    }
    for (const m of p.missingChoices) {
      await client.request('PATCH', `${base(id)}/columns/${m.remoteId}`, { body: { choice: { allowTextEntry: false, choices: m.all, displayAs: m.column.type === 'multichoice' ? 'checkBoxes' : 'dropDownMenu' } } });
      log(`Added choices ${m.values.join(', ')} to ${p.list.name}.${m.column.name}`);
    }
  }
}
