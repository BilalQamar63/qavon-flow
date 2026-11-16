import { ONBOARDING_SECTIONS } from '../constants/onboarding';
import type { AgencyNavPage } from '../store/slices/uiSlice';
import type { OnboardingSectionKey } from '../types';

const AGENCY_NAV_PAGES: readonly AgencyNavPage[] = [
  'overview',
  'clients',
  'onboarding',
  'assets',
  'team',
  'activity',
  'settings',
];
const AGENCY_NAV_PAGE_SET = new Set<string>(AGENCY_NAV_PAGES);
const ONBOARDING_SECTION_SET = new Set<string>(
  ONBOARDING_SECTIONS.map((section) => section.key),
);

export interface ParsedAppRoute {
  page: AgencyNavPage;
  clientId: string | null;
  onboardingSectionKey: OnboardingSectionKey | null;
  portal: boolean;
}

function isAgencyNavPage(value: string | undefined): value is AgencyNavPage {
  return value !== undefined && AGENCY_NAV_PAGE_SET.has(value);
}

function parseSectionKey(value: string | undefined): OnboardingSectionKey | null {
  return value && ONBOARDING_SECTION_SET.has(value)
    ? (value as OnboardingSectionKey)
    : null;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseAppRoute(pathname: string): ParsedAppRoute {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'portal') {
    const sectionSegment =
      segments[1] === 'onboarding' ? segments[2] : segments[1];
    return {
      page: 'onboarding',
      clientId: null,
      onboardingSectionKey: parseSectionKey(sectionSegment) ?? 'company_info',
      portal: true,
    };
  }

  const pageSegment = segments[0];
  if (!isAgencyNavPage(pageSegment)) {
    return {
      page: 'overview',
      clientId: null,
      onboardingSectionKey: null,
      portal: false,
    };
  }

  if (pageSegment === 'onboarding') {
    return {
      page: pageSegment,
      clientId: segments[1] ? decodePathSegment(segments[1]) : null,
      onboardingSectionKey: parseSectionKey(segments[2]) ?? 'company_info',
      portal: false,
    };
  }

  return {
    page: pageSegment,
    clientId: null,
    onboardingSectionKey: null,
    portal: false,
  };
}

export function buildAppPath(params: {
  page: AgencyNavPage;
  clientId: string | null;
  onboardingSectionKey: OnboardingSectionKey;
  isClientPortal: boolean;
}): string {
  if (params.isClientPortal) {
    return `/portal/onboarding/${params.onboardingSectionKey}`;
  }

  if (params.page === 'onboarding' && params.clientId) {
    return `/onboarding/${encodeURIComponent(params.clientId)}/${params.onboardingSectionKey}`;
  }

  return `/${params.page}`;
}
