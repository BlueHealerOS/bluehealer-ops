import { useState } from 'react';
import { csvFileName, interactionsCsv, organizationsCsv, peopleCsv } from '../export.ts';
import { useCrm } from './crmCtx';
import { downloadText } from './download';
import { Section } from './parts';

export function ExportView() {
  const { data, today, notify } = useCrm();
  const [restricted, setRestricted] = useState(false);
  const get = (kind: 'people' | 'organizations' | 'interactions') => {
    const text = kind === 'people' ? peopleCsv(data, { includeRestricted: restricted }) : kind === 'organizations' ? organizationsCsv(data) : interactionsCsv(data, { includeRestricted: restricted });
    downloadText(csvFileName(kind, today), text, 'text/csv;charset=utf-8');
    notify(`Downloaded ${csvFileName(kind, today)}.`);
  };
  return (
    <section aria-labelledby="export-h" className="space-y-5">
      <h1 id="export-h" className="text-[1.75rem] md:text-display">Export</h1>
      <Section id="csv-h" title="Weekly CSV export">
        <p className="text-sm">Three files, built in this browser and saved to your Downloads. Keep them in the private hub repository or in SharePoint. The app never uploads them, and they must never go into this app's public repository.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />Include Restricted records ({data.people.filter((p) => p.sensitivity === 'Restricted').length} {data.people.filter((p) => p.sensitivity === 'Restricted').length === 1 ? 'person' : 'people'})</label>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => get('people')}>Download people</button>
          <button className="btn btn-primary" onClick={() => get('organizations')}>Download organizations</button>
          <button className="btn btn-primary" onClick={() => get('interactions')}>Download interactions</button>
        </div>
      </Section>
      <Section id="one-h" title="One person">
        <p className="text-sm">To answer an access request, open the person and choose Export for a JSON file with their record, organization and interactions. To delete someone, open them and choose Delete.</p>
      </Section>
    </section>
  );
}
