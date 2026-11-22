import tenant from '../config/tenant.json';

export const config = tenant as {
  tenantId: string; clientId: string; siteHostname: string; sitePath: string; redirectUri: string;
};
export const isConfigured = config.tenantId !== '00000000-0000-0000-0000-000000000000' && config.clientId !== '00000000-0000-0000-0000-000000000000';
