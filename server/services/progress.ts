import {
  DEFAULT_SECTION_DATA,
  ONBOARDING_SECTIONS,
  getNestedObjectValue,
  isOnboardingValueFilled,
  safeJsonParse,
} from '../../src/constants/onboarding.ts';
import type {
  AnySectionData,
  AssetCategory,
  OnboardingSectionKey,
  ProgressSummary,
  SectionCompletionStatus,
} from '../../src/types/index.ts';

export interface RawSectionRow {
  client_id?: string;
  section_key: OnboardingSectionKey;
  status: SectionCompletionStatus;
  data_json: string;
  updated_at: string | null;
}

export interface RawAssetRow {
  client_id?: string;
  category: AssetCategory;
  created_at: string;
}

export function calculateClientProgress(params: {
  requiredSections: OnboardingSectionKey[];
  sections: RawSectionRow[];
  assets: RawAssetRow[];
  credentialCount: number;
  clientUpdatedAt: string;
}): ProgressSummary {
  const requiredSet = new Set<OnboardingSectionKey>(params.requiredSections);
  const sectionMap = new Map<OnboardingSectionKey, RawSectionRow>();
  let lastActivityAt: string | null = params.clientUpdatedAt || null;

  for (const s of params.sections) {
    sectionMap.set(s.section_key, s);
    if (s.updated_at && (!lastActivityAt || s.updated_at > lastActivityAt)) {
      lastActivityAt = s.updated_at;
    }
  }

  const assetCategoriesPresent = new Set<AssetCategory>();
  for (const a of params.assets) {
    assetCategoriesPresent.add(a.category);
    if (a.created_at && (!lastActivityAt || a.created_at > lastActivityAt)) {
      lastActivityAt = a.created_at;
    }
  }

  const missingRequiredItems: ProgressSummary['missingRequiredItems'] = [];
  const pendingAssetSlots: ProgressSummary['pendingAssetSlots'] = [];

  let totalCheckpoints = 0;
  let completedCheckpoints = 0;
  let completedSections = 0;

  for (const def of ONBOARDING_SECTIONS) {
    const isRequired = requiredSet.has(def.key);
    const row = sectionMap.get(def.key);
    const fallbackData: AnySectionData = DEFAULT_SECTION_DATA[def.key];
    const parsedData = row ? safeJsonParse<object>(row.data_json, fallbackData) : fallbackData;

    if (row?.status === 'completed') {
      completedSections += 1;
    }

    if (!isRequired) {
      continue;
    }

    // Count required form fields
    for (const reqField of def.requiredFields) {
      totalCheckpoints += 1;
      const val = getNestedObjectValue(parsedData, reqField.path);
      if (isOnboardingValueFilled(val)) {
        completedCheckpoints += 1;
      } else {
        missingRequiredItems.push({
          sectionKey: def.key,
          sectionTitle: def.title,
          fieldLabel: reqField.label,
        });
      }
    }

    // Count required asset slots
    if (def.requiredAssetCategories) {
      for (const reqAsset of def.requiredAssetCategories) {
        totalCheckpoints += 1;
        if (assetCategoriesPresent.has(reqAsset.category)) {
          completedCheckpoints += 1;
        } else {
          pendingAssetSlots.push({
            category: reqAsset.category,
            label: reqAsset.label,
          });
        }
      }
    }

    // For access_credentials, check either credential count or delegated notes
    if (def.key === 'access_credentials') {
      totalCheckpoints += 1;
      const rawNotes = getNestedObjectValue(parsedData, 'delegatedAccessNotes');
      const delegatedNotes = typeof rawNotes === 'string' ? rawNotes.trim() : '';
      if (params.credentialCount > 0 || delegatedNotes.length > 0) {
        completedCheckpoints += 1;
      } else {
        missingRequiredItems.push({
          sectionKey: def.key,
          sectionTitle: def.title,
          fieldLabel: 'At least one credential or delegated access note',
        });
      }
    }
  }

  const rawPercentage =
    totalCheckpoints === 0 ? 100 : Math.round((completedCheckpoints / totalCheckpoints) * 100);
  const overallPercentage = Math.min(100, Math.max(0, rawPercentage));

  return {
    overallPercentage,
    completedSections,
    totalSections: ONBOARDING_SECTIONS.length,
    requiredSectionsCount: params.requiredSections.length,
    missingRequiredItems,
    pendingAssetSlots,
    lastActivityAt,
  };
}
