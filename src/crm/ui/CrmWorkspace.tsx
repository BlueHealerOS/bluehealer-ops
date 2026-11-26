import { CRM_SECTIONS } from '../../ui/nav';
import { useHashRoute } from '../../ui/router';
import { CrmProvider } from './CrmContext';
import { ExportView } from './ExportView';
import { NeedsAttention } from './NeedsAttention';
import { OrgPage, OrganizationsView } from './OrganizationsView';
import { PeopleView } from './PeopleView';
import { ProfilePage } from './ProfilePage';
import { TodayView } from './TodayView';

/** The CRM tab. Routes live under #/crm/. */
export function CrmWorkspace() {
  const { segments } = useHashRoute();
  const view = segments[1] ?? 'today';
  const id = Number(segments[2]);
  const current = view === 'person' ? 'people' : view === 'org' ? 'organizations' : view;
  return (
    <div className="space-y-4">
      <nav aria-label="CRM views" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:hidden">
        {CRM_SECTIONS.map(([k, label]) => <a key={k} href={`#/crm/${k}`} aria-current={current === k ? 'page' : undefined} className={`btn whitespace-nowrap ${current === k ? 'btn-primary' : ''}`}>{label}</a>)}
      </nav>
      <CrmProvider>
        {view === 'people' ? <PeopleView />
          : view === 'organizations' ? <OrganizationsView />
          : view === 'attention' ? <NeedsAttention />
          : view === 'export' ? <ExportView />
          : view === 'person' && Number.isInteger(id) ? <ProfilePage id={id} />
          : view === 'org' && Number.isInteger(id) ? <OrgPage id={id} />
          : <TodayView />}
      </CrmProvider>
    </div>
  );
}
