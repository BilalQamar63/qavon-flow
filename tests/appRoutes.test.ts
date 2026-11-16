import { describe, expect, it } from 'vitest';
import { buildAppPath, parseAppRoute } from '../src/utils/appRoutes';

describe('app routes', () => {
  it.each([
    ['/overview', 'overview'],
    ['/clients', 'clients'],
    ['/assets', 'assets'],
    ['/team', 'team'],
    ['/activity', 'activity'],
    ['/settings', 'settings'],
  ] as const)('restores the %s sidebar page', (pathname, page) => {
    expect(parseAppRoute(pathname).page).toBe(page);
  });

  it('restores the selected client and onboarding section', () => {
    expect(parseAppRoute('/onboarding/client-1/additional_documents')).toEqual({
      page: 'onboarding',
      clientId: 'client-1',
      onboardingSectionKey: 'additional_documents',
      portal: false,
    });
  });

  it('restores a client portal onboarding section', () => {
    expect(parseAppRoute('/portal/onboarding/website_content')).toEqual({
      page: 'onboarding',
      clientId: null,
      onboardingSectionKey: 'website_content',
      portal: true,
    });
  });

  it('builds paths for agency pages and client portal sections', () => {
    expect(
      buildAppPath({
        page: 'onboarding',
        clientId: 'client-1',
        onboardingSectionKey: 'brand_assets',
        isClientPortal: false,
      }),
    ).toBe('/onboarding/client-1/brand_assets');

    expect(
      buildAppPath({
        page: 'onboarding',
        clientId: null,
        onboardingSectionKey: 'brand_assets',
        isClientPortal: true,
      }),
    ).toBe('/portal/onboarding/brand_assets');
  });
});
