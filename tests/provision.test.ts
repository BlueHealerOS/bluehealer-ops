import { describe, expect, it } from 'vitest';
import { applyProvision, planProvision, toGraphColumn } from '../src/provision/provision';
import { LISTS, type ListDef } from '../src/schema/lists';
import { makeEnv } from './helpers';

describe('provisioning', () => {
  it('creates all lists with columns, lookups and indexes', async () => {
    const { client, store, fake } = makeEnv();
    const plan = await planProvision(client, await store.siteId(), LISTS);
    expect(plan.lists.every((l) => l.create)).toBe(true);
    await applyProvision(client, plan);
    expect(fake.state.lists).toHaveLength(18);
    const tasks = fake.state.lists.find((l) => l.displayName === 'Tasks')!;
    const status = tasks.columns.find((c) => c.name === 'Status')!;
    expect(status.indexed).toBe(true);
    const milestone = tasks.columns.find((c) => c.name === 'Milestone')!;
    const milestonesId = fake.state.lists.find((l) => l.displayName === 'Milestones')!.id;
    expect(milestone.lookup).toMatchObject({ listId: milestonesId, columnName: 'Title' });
    const people = fake.state.lists.find((l) => l.displayName === 'People')!;
    expect(people.columns.some((c) => c.name === 'IntroducedBy')).toBe(true); // self lookup added after creation
  });
  it('is idempotent: a second run plans and changes nothing', async () => {
    const { client, store, fake } = makeEnv();
    const sid = await store.siteId();
    await applyProvision(client, await planProvision(client, sid, LISTS));
    const before = JSON.stringify(fake.state.lists);
    const plan2 = await planProvision(client, sid, LISTS);
    expect(plan2.changes).toBe(0);
    await applyProvision(client, plan2);
    expect(JSON.stringify(fake.state.lists)).toBe(before);
  });
  it('adds a new column and new choice values, and never removes anything', async () => {
    const { client, store, fake } = makeEnv();
    const sid = await store.siteId();
    await applyProvision(client, await planProvision(client, sid, LISTS));
    const grown: ListDef[] = LISTS.map((l) => l.name !== 'Tasks' ? l : {
      ...l,
      columns: [...l.columns.map((c) => c.name === 'Priority' ? { ...c, choices: [...c.choices!, 'P4'] } : c), { name: 'NewColumn', type: 'text' as const }],
    });
    const plan = await planProvision(client, sid, grown);
    expect(plan.changes).toBe(2);
    await applyProvision(client, plan);
    const tasks = fake.state.lists.find((l) => l.displayName === 'Tasks')!;
    expect(tasks.columns.some((c) => c.name === 'NewColumn')).toBe(true);
    expect((tasks.columns.find((c) => c.name === 'Priority')!.choice as { choices: string[] }).choices).toEqual(['P0', 'P1', 'P2', 'P3', 'P4']);
    expect(tasks.columns.length).toBe(LISTS.find((l) => l.name === 'Tasks')!.columns.length + 2);
  });
  it('maps column types to Graph definitions', () => {
    const ids = new Map([['Milestones', 'L1']]);
    expect(toGraphColumn({ name: 'D', type: 'date', indexed: true }, ids)).toMatchObject({ dateTime: { format: 'dateOnly' }, indexed: true });
    expect(toGraphColumn({ name: 'N', type: 'note' }, ids)).toMatchObject({ text: { allowMultipleLines: true } });
    expect(toGraphColumn({ name: 'M', type: 'multichoice', choices: ['a'] }, ids)).toMatchObject({ choice: { displayAs: 'checkBoxes' } });
    expect(toGraphColumn({ name: 'L', type: 'lookup', lookup: 'Milestones' }, ids)).toMatchObject({ lookup: { listId: 'L1' } });
    expect(() => toGraphColumn({ name: 'L', type: 'lookup', lookup: 'Nope' }, ids)).toThrow();
  });
});
