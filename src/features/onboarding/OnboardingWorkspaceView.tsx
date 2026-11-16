import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  FormControlLabel,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Edit2,
  FolderOpen,
  Globe,
  Mail,
  Phone,
  RotateCcw,
  Save,
  Send,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ClientAvatar } from "../../components/common/ClientAvatar";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FileUploader } from "../../components/common/FileUploader";
import { LoadingState } from "../../components/common/LoadingState";
import { PageContainer } from "../../components/common/PageContainer";
import { PageHeader } from "../../components/common/PageHeader";
import { ProgressIndicator } from "../../components/common/ProgressIndicator";
import { StatusBadge } from "../../components/common/StatusBadge";
import {
  DEFAULT_SECTION_DATA,
  ONBOARDING_SECTIONS,
  getNestedObjectValue,
  isOnboardingValueFilled,
} from "../../constants/onboarding";
import {
  useGetClientDetailQuery,
  useGetClientsQuery,
  useGetOnboardingWorkspaceQuery,
  useReviewOnboardingSectionMutation,
  useSaveOnboardingSectionMutation,
  useUpdateClientMutation,
} from "../../store/api/hubApi";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  setActiveOnboardingSectionKey,
  setSelectedClientId,
  showToast,
} from "../../store/slices/uiSlice";
import { FONT_DISPLAY, FONT_MONO, themePalette } from "../../theme";
import type {
  AccessCredentialsMetaData,
  AdditionalDocumentsMetaData,
  AnySectionData,
  AssetRecord,
  BrandAssetsData,
  CompanyInfoData,
  OnboardingSectionKey,
  OnboardingSectionState,
  ProjectRequirementsData,
  UserRole,
  WebsiteContentData,
} from "../../types";
import { getApiErrorMessage, getApiMissingItems } from "../../utils/apiError";
import { formatRelativeTime, formatShortDate } from "../../utils/format";
import { ClientFormDialog } from "../clients/ClientFormDialog";
import { InviteClientDialog } from "../clients/InviteClientDialog";
import { CredentialVaultPanel } from "./CredentialVaultPanel";
import { SectionAssetsList } from "./SectionAssetsList";

const SECTION_DEF_BY_KEY = new Map(ONBOARDING_SECTIONS.map((s) => [s.key, s]));
const SECTION_INDEX_BY_KEY = new Map(
  ONBOARDING_SECTIONS.map((s, idx) => [s.key, idx]),
);
const BRAND_ASSET_CATEGORIES = new Set([
  "primary_logo",
  "secondary_logo",
  "brand_icon",
  "brand_guidelines",
]);

interface OnboardingWorkspaceViewProps {
  fixedClientId?: string | null;
  viewerRole: UserRole;
}

export function OnboardingWorkspaceView({
  fixedClientId,
  viewerRole,
}: OnboardingWorkspaceViewProps) {
  const dispatch = useAppDispatch();
  const selectedClientId = useAppSelector((s) => s.ui.selectedClientId);
  const activeSectionKey = useAppSelector(
    (s) => s.ui.activeOnboardingSectionKey,
  );
  const isClientPortal = viewerRole === "client";
  const setActiveSectionKey = (sectionKey: OnboardingSectionKey) =>
    dispatch(setActiveOnboardingSectionKey(sectionKey));

  const { data: clientsData } = useGetClientsQuery(
    { status: "all" },
    { skip: isClientPortal },
  );

  const activeClientId =
    fixedClientId || selectedClientId || clientsData?.clients?.[0]?.id || null;

  const [workspaceTab, setWorkspaceTab] = useState<
    "modules" | "profile" | "activity"
  >("modules");
  const [reviewNote, setReviewNote] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [justSubmittedSection, setJustSubmittedSection] =
    useState<OnboardingSectionKey | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const {
    data: workspace,
    isLoading,
    isError,
    refetch,
  } = useGetOnboardingWorkspaceQuery(activeClientId || "", {
    skip: !activeClientId,
  });

  const { data: clientDetailData } = useGetClientDetailQuery(
    activeClientId || "",
    {
      skip: !activeClientId || isClientPortal,
    },
  );

  const [saveSection, { isLoading: saving }] =
    useSaveOnboardingSectionMutation();
  const [reviewSection, { isLoading: reviewing }] =
    useReviewOnboardingSectionMutation();
  const [updateClient, { isLoading: updatingNotes }] =
    useUpdateClientMutation();

  useEffect(() => {
    const firstClientId = clientsData?.clients?.[0]?.id;
    if (!isClientPortal && !selectedClientId && firstClientId) {
      dispatch(setSelectedClientId(firstClientId));
    }
  }, [clientsData?.clients, dispatch, isClientPortal, selectedClientId]);

  // Form states per section
  const [companyForm, setCompanyForm] = useState<CompanyInfoData>(
    DEFAULT_SECTION_DATA.company_info,
  );
  const [brandForm, setBrandForm] = useState<BrandAssetsData>(
    DEFAULT_SECTION_DATA.brand_assets,
  );
  const [colorInput, setColorInput] = useState("#EDA320");
  const [contentForm, setContentForm] = useState<WebsiteContentData>(
    DEFAULT_SECTION_DATA.website_content,
  );
  const [reqForm, setReqForm] = useState<ProjectRequirementsData>(
    DEFAULT_SECTION_DATA.project_requirements,
  );
  const [accessMetaForm, setAccessMetaForm] =
    useState<AccessCredentialsMetaData>(
      DEFAULT_SECTION_DATA.access_credentials,
    );
  const [docsMetaForm, setDocsMetaForm] = useState<AdditionalDocumentsMetaData>(
    DEFAULT_SECTION_DATA.additional_documents,
  );

  useEffect(() => {
    if (!workspace) return;
    setNotesDraft(workspace.client.internalNotes || "");
    setValidationErrors([]);
    for (const sec of workspace.sections) {
      if (sec.sectionKey === "company_info") {
        setCompanyForm({
          ...DEFAULT_SECTION_DATA.company_info,
          ...(sec.data as CompanyInfoData),
        });
      } else if (sec.sectionKey === "brand_assets") {
        setBrandForm({
          ...DEFAULT_SECTION_DATA.brand_assets,
          ...(sec.data as BrandAssetsData),
        });
      } else if (sec.sectionKey === "website_content") {
        setContentForm({
          ...DEFAULT_SECTION_DATA.website_content,
          ...(sec.data as WebsiteContentData),
        });
      } else if (sec.sectionKey === "project_requirements") {
        setReqForm({
          ...DEFAULT_SECTION_DATA.project_requirements,
          ...(sec.data as ProjectRequirementsData),
        });
      } else if (sec.sectionKey === "access_credentials") {
        setAccessMetaForm({
          ...DEFAULT_SECTION_DATA.access_credentials,
          ...(sec.data as AccessCredentialsMetaData),
        });
      } else if (sec.sectionKey === "additional_documents") {
        setDocsMetaForm({
          ...DEFAULT_SECTION_DATA.additional_documents,
          ...(sec.data as AdditionalDocumentsMetaData),
        });
      }
    }
  }, [workspace]);

  useEffect(() => {
    setValidationErrors([]);
    setJustSubmittedSection(null);
  }, [activeSectionKey]);

  const {
    assetCountByCategory,
    brandAssets,
    websiteAssets,
    additionalDocAssets,
  } = useMemo(() => {
    const counts: Record<string, number> = {};
    const brand: AssetRecord[] = [];
    const website: AssetRecord[] = [];
    const additionalDocs: AssetRecord[] = [];

    for (const asset of workspace?.assets || []) {
      counts[asset.category] = (counts[asset.category] || 0) + 1;
      if (BRAND_ASSET_CATEGORIES.has(asset.category)) {
        brand.push(asset);
      } else if (asset.category === "website_media") {
        website.push(asset);
      } else if (asset.category === "additional_document") {
        additionalDocs.push(asset);
      }
    }

    return {
      assetCountByCategory: counts,
      brandAssets: brand,
      websiteAssets: website,
      additionalDocAssets: additionalDocs,
    };
  }, [workspace?.assets]);

  const { sectionByKey, sectionsNeedingRevision } = useMemo(() => {
    const byKey = new Map<OnboardingSectionKey, OnboardingSectionState>();
    const needsRev: OnboardingSectionState[] = [];
    for (const sec of workspace?.sections || []) {
      byKey.set(sec.sectionKey, sec);
      if (sec.status === "needs_revision") {
        needsRev.push(sec);
      }
    }
    return { sectionByKey: byKey, sectionsNeedingRevision: needsRev };
  }, [workspace?.sections]);

  if (!activeClientId) {
    return (
      <PageContainer>
        <EmptyState
          title="No client workspace selected"
          description="Create a client from the Clients page to configure and monitor their onboarding sections."
          icon={<FolderOpen size={20} />}
        />
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState variant="workspace" />
      </PageContainer>
    );
  }

  if (isError || !workspace) {
    return (
      <PageContainer>
        <ErrorState
          message="Unable to load onboarding workspace."
          onRetry={refetch}
        />
      </PageContainer>
    );
  }

  const activeSection =
    sectionByKey.get(activeSectionKey) || workspace.sections[0];
  const activeSectionIdx = SECTION_INDEX_BY_KEY.get(activeSectionKey) ?? 0;
  const prevSection =
    activeSectionIdx > 0 ? ONBOARDING_SECTIONS[activeSectionIdx - 1] : null;
  const nextSection =
    activeSectionIdx < ONBOARDING_SECTIONS.length - 1
      ? ONBOARDING_SECTIONS[activeSectionIdx + 1]
      : null;

  const totalMissingCount =
    workspace.progress.missingRequiredItems.length +
    workspace.progress.pendingAssetSlots.length;
  const isPortalLocked =
    isClientPortal &&
    (workspace.client.status === "completed" ||
      workspace.client.status === "archived");

  const getCurrentPayload = (): AnySectionData => {
    switch (activeSectionKey) {
      case "company_info":
        return companyForm;
      case "brand_assets":
        return brandForm;
      case "website_content":
        return contentForm;
      case "project_requirements":
        return reqForm;
      case "access_credentials":
        return accessMetaForm;
      case "additional_documents":
        return docsMetaForm;
    }
  };

  const validateBeforeSubmit = (): string[] => {
    const def = SECTION_DEF_BY_KEY.get(activeSectionKey);
    if (!def) return [];
    const payload = getCurrentPayload();
    const missing: string[] = [];

    if (activeSection.required) {
      for (const reqField of def.requiredFields) {
        if (
          !isOnboardingValueFilled(getNestedObjectValue(payload, reqField.path))
        ) {
          missing.push(`${reqField.label} is required`);
        }
      }
      if (def.requiredAssetCategories) {
        const present = new Set(workspace.assets.map((a) => a.category));
        for (const reqAsset of def.requiredAssetCategories) {
          if (!present.has(reqAsset.category)) {
            missing.push(`Upload required: ${reqAsset.label}`);
          }
        }
      }
      if (
        def.key === "access_credentials" &&
        workspace.credentials.length === 0 &&
        !accessMetaForm.delegatedAccessNotes.trim()
      ) {
        missing.push(
          "Add at least one encrypted credential or enter delegated access notes",
        );
      }
    }

    if (
      activeSectionKey === "company_info" &&
      companyForm.contactEmail.trim()
    ) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        companyForm.contactEmail.trim(),
      );
      if (!emailOk) missing.push("Contact Email must be a valid email address");
    }

    return missing;
  };

  const handleSave = async (markComplete: boolean) => {
    if (markComplete) {
      const errs = validateBeforeSubmit();
      if (errs.length > 0) {
        setValidationErrors(errs);
        setJustSubmittedSection(null);
        dispatch(
          showToast({
            severity: "warning",
            text: "Please complete the highlighted required items before submitting.",
          }),
        );
        return;
      }
    }

    setValidationErrors([]);
    try {
      await saveSection({
        clientId: workspace.client.id,
        sectionKey: activeSectionKey,
        data: getCurrentPayload(),
        markComplete,
      }).unwrap();
      if (markComplete) {
        setJustSubmittedSection(activeSectionKey);
      } else {
        setJustSubmittedSection(null);
      }
      dispatch(
        showToast({
          severity: "success",
          text: markComplete
            ? `${activeSection.title} submitted`
            : `Draft saved for ${activeSection.title}`,
        }),
      );
    } catch (err: unknown) {
      const missing = getApiMissingItems(err);
      if (missing.length > 0) {
        setValidationErrors(missing);
      }
      dispatch(
        showToast({
          severity: "error",
          text: getApiErrorMessage(err, "Failed to save section"),
        }),
      );
    }
  };

  const handleReview = async (decision: "completed" | "needs_revision") => {
    try {
      await reviewSection({
        clientId: workspace.client.id,
        sectionKey: activeSectionKey,
        decision,
        note: reviewNote,
      }).unwrap();
      setReviewNote("");
      dispatch(
        showToast({
          severity: "success",
          text:
            decision === "completed"
              ? `Approved ${activeSection.title}`
              : `Requested revision on ${activeSection.title}`,
        }),
      );
    } catch {
      dispatch(
        showToast({
          severity: "error",
          text: "Unable to submit review decision",
        }),
      );
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateClient({
        id: workspace.client.id,
        patch: { internalNotes: notesDraft },
      }).unwrap();
      dispatch(
        showToast({
          severity: "success",
          text: "Internal agency notes updated",
        }),
      );
    } catch {
      dispatch(
        showToast({
          severity: "error",
          text: "Failed to update internal notes",
        }),
      );
    }
  };

  const fullClientRecord = clientDetailData?.client || null;
  const clientActivity = clientDetailData?.activity || [];

  const primaryLogoCount = assetCountByCategory.primary_logo || 0;
  const secondaryLogoCount = assetCountByCategory.secondary_logo || 0;
  const brandIconCount = assetCountByCategory.brand_icon || 0;
  const brandGuidelinesCount = assetCountByCategory.brand_guidelines || 0;

  const content = (
    <>
      {isClientPortal ? (
        /* Distinct Client Portal Welcome Card */
        <Card
          sx={{
            mb: 3,
            bgcolor: themePalette.background.darkSurface,
            color: themePalette.text.onDark,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Grid container spacing={3} sx={{ alignItems: "center" }}>
              <Grid size={{ xs: 12, lg: 6 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    color: themePalette.accent.main,
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    mb: 0.75,
                  }}
                >
                  QavonFlow Client Portal · {workspace.client.companyName}
                </Typography>
                <Typography
                  variant="h1"
                  sx={{ color: themePalette.text.onDark, mb: 1 }}
                >
                  Welcome, {workspace.client.contactName}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: themePalette.text.onDarkMuted, maxWidth: 520 }}
                >
                  Everything needed to kick off your project lives here. Work
                  through the sections below at your own pace — save drafts
                  anytime and submit each module when ready.
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, lg: 6 }}>
                <Grid container spacing={1.5}>
                  {[
                    {
                      num: "01",
                      title: "Fill Required Modules",
                      desc: "Provide company, copy, & brief details",
                    },
                    {
                      num: "02",
                      title: "Upload Brand Files",
                      desc: "Add primary logo, guidelines, & media",
                    },
                    {
                      num: "03",
                      title: "Submit for Review",
                      desc: "Track completion & agency approval",
                    },
                  ].map((step) => (
                    <Grid key={step.num} size={{ xs: 12, sm: 4 }}>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: "8px",
                          bgcolor: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          height: "100%",
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center", mb: 0.5 }}
                        >
                          <Box
                            sx={{
                              width: 22,
                              height: 22,
                              borderRadius: "5px",
                              bgcolor: themePalette.accent.main,
                              color: themePalette.primary.main,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontFamily: FONT_DISPLAY,
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              fontVariantNumeric: "tabular-nums",
                              flexShrink: 0,
                            }}
                          >
                            {step.num}
                          </Box>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              color: themePalette.text.onDark,
                              fontSize: "0.8125rem",
                            }}
                          >
                            {step.title}
                          </Typography>
                        </Stack>
                        <Typography
                          variant="caption"
                          sx={{ color: themePalette.text.onDarkMuted }}
                        >
                          {step.desc}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      ) : (
        <PageHeader
          title={`${workspace.client.companyName} — Onboarding`}
          subtitle={`${workspace.client.industry} · Contact: ${workspace.client.contactName} (${workspace.client.email})`}
          actions={
            clientsData?.clients ? (
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexWrap: "wrap", alignItems: "center" }}
              >
                <TextField
                  select
                  label="Switch Client"
                  value={workspace.client.id}
                  onChange={(e) =>
                    dispatch(setSelectedClientId(e.target.value))
                  }
                  sx={{ minWidth: { xs: 190, sm: 220 } }}
                >
                  {clientsData.clients.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.companyName} ({c.progress.overallPercentage}%)
                    </MenuItem>
                  ))}
                </TextField>
                {fullClientRecord && (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Mail size={14} />}
                      onClick={() => setInviteOpen(true)}
                    >
                      Invite Link
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Edit2 size={14} />}
                      onClick={() => setEditOpen(true)}
                    >
                      Edit Client
                    </Button>
                  </>
                )}
              </Stack>
            ) : undefined
          }
        />
      )}

      {/* Workspace Status Alerts */}
      {workspace.client.status === "completed" && (
        <Alert
          severity="success"
          icon={<CheckCircle2 size={18} />}
          sx={{ mb: 2.5 }}
        >
          <strong>Onboarding Complete & Approved:</strong> All required
          onboarding modules and assets have been submitted and verified
          {isClientPortal ? ". This workspace is now read-only." : "."}
        </Alert>
      )}
      {workspace.client.status === "in_review" && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          <strong>Submitted for Agency Review:</strong> All required onboarding
          sections are submitted ({workspace.progress.completedSections} of{" "}
          {workspace.progress.totalSections} complete). Our team is reviewing
          your files and details.
        </Alert>
      )}
      {sectionsNeedingRevision.length > 0 && (
        <Alert
          severity="warning"
          icon={<AlertTriangle size={18} />}
          sx={{ mb: 2.5 }}
        >
          <Typography variant="subtitle2" sx={{ color: "inherit", mb: 0.25 }}>
            Action Requested — {sectionsNeedingRevision.length}{" "}
            {sectionsNeedingRevision.length === 1
              ? "section needs"
              : "sections need"}{" "}
            revision:
          </Typography>
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            {sectionsNeedingRevision.map((sec) => (
              <Typography
                key={sec.sectionKey}
                variant="caption"
                onClick={() => {
                  setWorkspaceTab("modules");
                  setActiveSectionKey(sec.sectionKey);
                }}
                sx={{
                  cursor: "pointer",
                  color: "inherit",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                Open {sec.title}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {/* Dynamic Progress Summary Banner */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Grid container spacing={3} sx={{ alignItems: "center" }}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Stack
                direction="row"
                sx={{
                  mb: 1,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="h4">
                  Overall Onboarding Progress
                </Typography>
                <StatusBadge status={workspace.client.status} kind="client" />
              </Stack>
              <ProgressIndicator
                percentage={workspace.progress.overallPercentage}
                label={`${workspace.progress.completedSections} of ${workspace.progress.totalSections} sections completed`}
                height={8}
              />
              <Stack
                direction="row"
                spacing={2}
                useFlexGap
                sx={{ mt: 1, flexWrap: "wrap", alignItems: "center" }}
              >
                {workspace.client.dueDate && (
                  <Typography
                    variant="caption"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    Target completion date:{" "}
                    {formatShortDate(workspace.client.dueDate)}
                  </Typography>
                )}
                <Typography
                  variant="caption"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {workspace.assets.length}{" "}
                  {workspace.assets.length === 1 ? "file" : "files"} uploaded ·{" "}
                  {workspace.credentials.length} encrypted{" "}
                  {workspace.credentials.length === 1 ? "entry" : "entries"}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Typography
                variant="subtitle2"
                sx={{ color: themePalette.text.primary, mb: 0.75 }}
              >
                {totalMissingCount === 0
                  ? "Required Checklist Complete"
                  : `Still Missing (${totalMissingCount})`}
              </Typography>
              {totalMissingCount === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: themePalette.status.success, fontWeight: 500 }}
                >
                  All required onboarding items and asset slots are fulfilled.
                </Typography>
              ) : (
                <Stack spacing={0.5}>
                  {workspace.progress.missingRequiredItems
                    .slice(0, 4)
                    .map((m, idx) => (
                      <Typography
                        key={`${m.sectionKey}-${idx}`}
                        variant="caption"
                        onClick={() => {
                          setWorkspaceTab("modules");
                          setActiveSectionKey(m.sectionKey);
                        }}
                        sx={{
                          cursor: "pointer",
                          color: themePalette.text.secondary,
                          "&:hover": {
                            color: themePalette.text.primary,
                            textDecoration: "underline",
                          },
                        }}
                      >
                        • {m.sectionTitle}: {m.fieldLabel}
                      </Typography>
                    ))}
                  {workspace.progress.missingRequiredItems.length > 4 && (
                    <Typography
                      variant="caption"
                      sx={{ color: themePalette.text.muted }}
                    >
                      + {workspace.progress.missingRequiredItems.length - 4}{" "}
                      more items across incomplete sections
                    </Typography>
                  )}
                  {workspace.progress.pendingAssetSlots.map((slot) => (
                    <Typography
                      key={slot.category}
                      variant="caption"
                      onClick={() => {
                        setWorkspaceTab("modules");
                        setActiveSectionKey("brand_assets");
                      }}
                      sx={{
                        cursor: "pointer",
                        color: themePalette.text.secondary,
                        "&:hover": {
                          color: themePalette.text.primary,
                          textDecoration: "underline",
                        },
                      }}
                    >
                      • Pending upload: {slot.label}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Agency Staff View Switcher (NEVER rendered in Client Portal) */}
      {!isClientPortal && (
        <Box
          sx={{ mb: 2.5, borderBottom: `1px solid ${themePalette.divider}` }}
        >
          <Tabs
            value={workspaceTab}
            onChange={(_, val: "modules" | "profile" | "activity") =>
              setWorkspaceTab(val)
            }
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab value="modules" label="Onboarding Modules" />
            <Tab value="profile" label="Client Profile & Notes" />
            <Tab
              value="activity"
              label={`Client Activity (${clientActivity.length})`}
            />
          </Tabs>
        </Box>
      )}

      {/* TAB: CLIENT PROFILE & NOTES (Agency Staff Only) */}
      {!isClientPortal && workspaceTab === "profile" && (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ mb: 3, alignItems: "center" }}
                >
                  <ClientAvatar name={workspace.client.companyName} size={48} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h3">
                      {workspace.client.companyName}
                    </Typography>
                    <Typography variant="body2">
                      {workspace.client.industry}
                    </Typography>
                  </Box>
                </Stack>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", mb: 0.25 }}
                    >
                      <User size={14} color={themePalette.text.muted} />
                      <Typography variant="caption">Primary Contact</Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ color: themePalette.text.primary, fontWeight: 500 }}
                    >
                      {workspace.client.contactName}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", mb: 0.25 }}
                    >
                      <Mail size={14} color={themePalette.text.muted} />
                      <Typography variant="caption">Email</Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ color: themePalette.text.primary }}
                    >
                      {workspace.client.email}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", mb: 0.25 }}
                    >
                      <Phone size={14} color={themePalette.text.muted} />
                      <Typography variant="caption">Phone</Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ color: themePalette.text.primary }}
                    >
                      {workspace.client.phone || "Not provided"}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", mb: 0.25 }}
                    >
                      <Globe size={14} color={themePalette.text.muted} />
                      <Typography variant="caption">Website</Typography>
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ color: themePalette.text.primary }}
                    >
                      {workspace.client.website || "Not provided"}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography
                      variant="caption"
                      sx={{ display: "block", mb: 0.25 }}
                    >
                      Assigned Producer
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: themePalette.text.primary, fontWeight: 500 }}
                    >
                      {fullClientRecord?.assignedToName || "Unassigned"}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography
                      variant="caption"
                      sx={{ display: "block", mb: 0.25 }}
                    >
                      Latest Invitation
                    </Typography>
                    {fullClientRecord?.latestInvitationStatus ? (
                      <StatusBadge
                        status={fullClientRecord.latestInvitationStatus}
                        kind="invitation"
                      />
                    ) : (
                      <Typography variant="body2">Not invited yet</Typography>
                    )}
                  </Grid>
                </Grid>

                {workspace.client.description && (
                  <>
                    <Divider sx={{ my: 2.5 }} />
                    <Typography
                      variant="subtitle2"
                      sx={{ color: themePalette.text.primary, mb: 0.5 }}
                    >
                      Project Brief
                    </Typography>
                    <Typography variant="body2">
                      {workspace.client.description}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h4" sx={{ mb: 0.5 }}>
                  Internal Agency Notes
                </Typography>
                <Typography variant="caption" sx={{ display: "block", mb: 2 }}>
                  Private delivery notes for agency staff. Never visible inside
                  the client portal.
                </Typography>
                <TextField
                  multiline
                  rows={5}
                  fullWidth
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Add handoff context, deadline caveats, or stakeholder notes..."
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  disabled={updatingNotes}
                  startIcon={<Save size={15} />}
                  onClick={handleSaveNotes}
                >
                  {updatingNotes ? "Saving..." : "Save Internal Notes"}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* TAB: CLIENT ACTIVITY HISTORY (Agency Staff Only) */}
      {!isClientPortal && workspaceTab === "activity" && (
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h4" sx={{ mb: 2 }}>
              Client Audit & Activity History
            </Typography>
            {clientActivity.length === 0 ? (
              <EmptyState
                embedded
                title="No activity recorded for this client"
                description="Submissions, asset uploads, invitations, and credential reveals appear here."
              />
            ) : (
              <Stack divider={<Divider />} spacing={0}>
                {clientActivity.map((log) => (
                  <Stack
                    key={log.id}
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{
                      py: 1.5,
                      justifyContent: "space-between",
                      alignItems: { sm: "center" },
                    }}
                  >
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: themePalette.text.primary }}
                      >
                        {log.action}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: "0.84375rem" }}
                      >
                        {log.details}
                      </Typography>
                      <Typography variant="caption">
                        {log.actorName} ({log.actorRole})
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatShortDate(log.createdAt)} ·{" "}
                      {formatRelativeTime(log.createdAt)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB: ONBOARDING MODULES (Always shown in Client Portal, and default tab for Agency) */}
      {(isClientPortal || workspaceTab === "modules") && (
        <Grid container spacing={3}>
          {/* Mobile Section Picker */}
          <Grid size={{ xs: 12 }} sx={{ display: { xs: "block", md: "none" } }}>
            <TextField
              select
              label="Onboarding Section"
              fullWidth
              value={activeSectionKey}
              onChange={(e) =>
                setActiveSectionKey(e.target.value as OnboardingSectionKey)
              }
            >
              {ONBOARDING_SECTIONS.map((def, idx) => {
                const secState = sectionByKey.get(def.key);
                const statusText =
                  secState?.status === "completed"
                    ? "Submitted"
                    : secState?.status === "needs_revision"
                      ? "Needs Revision"
                      : secState?.status === "in_progress"
                        ? "Draft Saved"
                        : "Not Started";
                return (
                  <MenuItem key={def.key} value={def.key}>
                    {idx + 1}. {def.title} ({statusText})
                  </MenuItem>
                );
              })}
            </TextField>
          </Grid>

          {/* Desktop Section Stepper */}
          <Grid
            size={{ md: 4, lg: 3.5 }}
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Card>
              <List disablePadding>
                {ONBOARDING_SECTIONS.map((def, idx) => {
                  const secState = sectionByKey.get(def.key);
                  const selected = activeSectionKey === def.key;
                  const isComplete = secState?.status === "completed";
                  const needsFix = secState?.status === "needs_revision";
                  return (
                    <Box key={def.key}>
                      {idx > 0 && <Divider />}
                      <ListItemButton
                        selected={selected}
                        onClick={() => setActiveSectionKey(def.key)}
                        sx={{
                          py: 1.5,
                          px: 2,
                          bgcolor: selected
                            ? themePalette.accent.soft
                            : "transparent",
                          borderLeft: `3px solid ${selected ? themePalette.accent.main : "transparent"}`,
                          "&.Mui-selected": {
                            bgcolor: themePalette.accent.soft,
                          },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  color: themePalette.text.primary,
                                  fontWeight: selected ? 700 : 600,
                                }}
                              >
                                {idx + 1}. {def.title}
                              </Typography>
                              {isComplete && (
                                <CheckCircle2
                                  size={15}
                                  color={themePalette.status.success}
                                />
                              )}
                              {needsFix && (
                                <AlertTriangle
                                  size={15}
                                  color={themePalette.status.warning}
                                />
                              )}
                            </Stack>
                          }
                          secondary={
                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{
                                mt: 0.625,
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <StatusBadge
                                status={secState?.status || "not_started"}
                                kind="section"
                              />
                              <Typography
                                variant="caption"
                                sx={{ color: themePalette.text.muted }}
                              >
                                {secState?.required ? "Required" : "Optional"}
                              </Typography>
                            </Stack>
                          }
                        />
                      </ListItemButton>
                    </Box>
                  );
                })}
              </List>
            </Card>

            {!isClientPortal && workspace.client.internalNotes && (
              <Card sx={{ mt: 2 }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ color: themePalette.text.primary, mb: 0.5 }}
                  >
                    Internal Agency Notes
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: "0.8125rem" }}>
                    {workspace.client.internalNotes}
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Grid>

          <Grid size={{ xs: 12, md: 8, lg: 8.5 }}>
            <Card>
              <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{
                    mb: 2,
                    justifyContent: "space-between",
                    alignItems: { xs: "flex-start", sm: "center" },
                  }}
                >
                  <Box>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", mb: 0.375 }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: FONT_DISPLAY,
                          fontWeight: 600,
                          color: themePalette.text.secondary,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Step {activeSectionIdx + 1} of{" "}
                        {ONBOARDING_SECTIONS.length} ·{" "}
                        {activeSection.required
                          ? "Required Module"
                          : "Optional Module"}
                      </Typography>
                    </Stack>
                    <Typography variant="h2">{activeSection.title}</Typography>
                    <Typography variant="body2">
                      {activeSection.description}
                    </Typography>
                  </Box>
                  <StatusBadge status={activeSection.status} kind="section" />
                </Stack>

                {/* Submission Confirmation Banner */}
                {(justSubmittedSection === activeSectionKey ||
                  activeSection.status === "completed") && (
                  <Alert
                    severity="success"
                    icon={<CheckCircle2 size={18} />}
                    sx={{
                      mb: 2.5,
                      flexWrap: { xs: "wrap", sm: "nowrap" },
                      "& .MuiAlert-message": { flex: 1, minWidth: 200 },
                      "& .MuiAlert-action": {
                        pt: { xs: 1, sm: 0 },
                        pl: { xs: 0, sm: 2 },
                        ml: { xs: 0, sm: "auto" },
                        width: { xs: "100%", sm: "auto" },
                        justifyContent: { xs: "flex-start", sm: "flex-end" },
                      },
                    }}
                    action={
                      nextSection ? (
                        <Button
                          color="inherit"
                          size="small"
                          endIcon={<ArrowRight size={14} />}
                          onClick={() => setActiveSectionKey(nextSection.key)}
                        >
                          Next: {nextSection.title}
                        </Button>
                      ) : undefined
                    }
                  >
                    <strong>Section Submitted</strong>
                    {activeSection.updatedAt
                      ? ` (${formatShortDate(activeSection.updatedAt)})`
                      : ""}
                    .{" "}
                    {isPortalLocked
                      ? "Approved and locked by the agency."
                      : "You can still edit details and re-save anytime before final sign-off."}
                  </Alert>
                )}

                {activeSection.reviewerNote && (
                  <Alert
                    severity={
                      activeSection.status === "needs_revision"
                        ? "warning"
                        : "info"
                    }
                    sx={{ mb: 2.5 }}
                  >
                    <strong>Agency Review Note:</strong>{" "}
                    {activeSection.reviewerNote}
                  </Alert>
                )}

                {validationErrors.length > 0 && (
                  <Alert severity="error" sx={{ mb: 2.5 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "inherit", mb: 0.5 }}
                    >
                      Please complete before submitting this section:
                    </Typography>
                    {validationErrors.map((msg) => (
                      <Typography
                        key={msg}
                        variant="body2"
                        sx={{ color: "inherit", fontSize: "0.8125rem" }}
                      >
                        • {msg}
                      </Typography>
                    ))}
                  </Alert>
                )}

                <Divider sx={{ mb: 3 }} />

                {/* SECTION 1: COMPANY INFO */}
                {activeSectionKey === "company_info" && (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Company Name"
                        required
                        fullWidth
                        value={companyForm.companyName}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            companyName: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Industry"
                        required
                        fullWidth
                        value={companyForm.industry}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            industry: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Business Description"
                        required
                        multiline
                        rows={3}
                        fullWidth
                        value={companyForm.businessDescription}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            businessDescription: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        label="Primary Contact Name"
                        required
                        fullWidth
                        value={companyForm.contactName}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            contactName: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        label="Contact Email"
                        type="email"
                        required
                        fullWidth
                        value={companyForm.contactEmail}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            contactEmail: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <TextField
                        label="Phone Number"
                        fullWidth
                        value={companyForm.contactPhone}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            contactPhone: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Website URL"
                        fullWidth
                        value={companyForm.website}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            website: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Business Address"
                        fullWidth
                        value={companyForm.businessAddress}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            businessAddress: e.target.value,
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="LinkedIn URL"
                        fullWidth
                        value={companyForm.socialLinks.linkedin}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            socialLinks: {
                              ...companyForm.socialLinks,
                              linkedin: e.target.value,
                            },
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Instagram URL"
                        fullWidth
                        value={companyForm.socialLinks.instagram}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            socialLinks: {
                              ...companyForm.socialLinks,
                              instagram: e.target.value,
                            },
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="X / Twitter URL"
                        fullWidth
                        value={companyForm.socialLinks.twitter}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            socialLinks: {
                              ...companyForm.socialLinks,
                              twitter: e.target.value,
                            },
                          })
                        }
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Facebook URL"
                        fullWidth
                        value={companyForm.socialLinks.facebook}
                        onChange={(e) =>
                          setCompanyForm({
                            ...companyForm,
                            socialLinks: {
                              ...companyForm.socialLinks,
                              facebook: e.target.value,
                            },
                          })
                        }
                      />
                    </Grid>
                  </Grid>
                )}

                {/* SECTION 2: BRAND ASSETS */}
                {activeSectionKey === "brand_assets" && (
                  <Stack spacing={3}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FileUploader
                          clientId={workspace.client.id}
                          category="primary_logo"
                          disabled={isPortalLocked}
                          label={`Primary Logo (Required${primaryLogoCount > 0 ? ` · ${primaryLogoCount} uploaded` : ""})`}
                          helperText={
                            primaryLogoCount > 0
                              ? "Primary logo uploaded. Drop another file to add a variant."
                              : "Required · Drag & drop SVG, PNG, or PDF (max 15 MB)"
                          }
                          onUploaded={() => {
                            refetch();
                            dispatch(
                              showToast({
                                severity: "success",
                                text: "Primary logo uploaded",
                              }),
                            );
                          }}
                          onError={(msg) =>
                            dispatch(
                              showToast({ severity: "error", text: msg }),
                            )
                          }
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FileUploader
                          clientId={workspace.client.id}
                          category="secondary_logo"
                          disabled={isPortalLocked}
                          label={`Secondary / Monochrome Logo${secondaryLogoCount > 0 ? ` (${secondaryLogoCount})` : ""}`}
                          helperText={
                            secondaryLogoCount > 0
                              ? `${secondaryLogoCount} file(s) uploaded · Optional`
                              : "Optional · Light/dark mark or lockup"
                          }
                          onUploaded={() => {
                            refetch();
                            dispatch(
                              showToast({
                                severity: "success",
                                text: "Secondary logo uploaded",
                              }),
                            );
                          }}
                          onError={(msg) =>
                            dispatch(
                              showToast({ severity: "error", text: msg }),
                            )
                          }
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FileUploader
                          clientId={workspace.client.id}
                          category="brand_icon"
                          disabled={isPortalLocked}
                          label={`Brand Mark / Favicon${brandIconCount > 0 ? ` (${brandIconCount})` : ""}`}
                          helperText={
                            brandIconCount > 0
                              ? `${brandIconCount} file(s) uploaded · Optional`
                              : "Optional · Square SVG or high-res PNG icon"
                          }
                          onUploaded={() => {
                            refetch();
                            dispatch(
                              showToast({
                                severity: "success",
                                text: "Brand icon uploaded",
                              }),
                            );
                          }}
                          onError={(msg) =>
                            dispatch(
                              showToast({ severity: "error", text: msg }),
                            )
                          }
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <FileUploader
                          clientId={workspace.client.id}
                          category="brand_guidelines"
                          disabled={isPortalLocked}
                          label={`Brand Guidelines PDF${brandGuidelinesCount > 0 ? ` (${brandGuidelinesCount})` : ""}`}
                          helperText={
                            brandGuidelinesCount > 0
                              ? `${brandGuidelinesCount} file(s) uploaded · Optional`
                              : "Optional · Style guide or brand book PDF"
                          }
                          onUploaded={() => {
                            refetch();
                            dispatch(
                              showToast({
                                severity: "success",
                                text: "Brand guidelines uploaded",
                              }),
                            );
                          }}
                          onError={(msg) =>
                            dispatch(
                              showToast({ severity: "error", text: msg }),
                            )
                          }
                        />
                      </Grid>
                    </Grid>

                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: themePalette.text.primary, mb: 1 }}
                      >
                        Uploaded Brand Files ({brandAssets.length})
                      </Typography>
                      <SectionAssetsList
                        assets={brandAssets}
                        clientId={workspace.client.id}
                        readOnly={isPortalLocked}
                      />
                    </Box>

                    <Divider />

                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: themePalette.text.primary, mb: 1 }}
                      >
                        Brand Color Palette (Required)
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ mb: 1.5, alignItems: "center", flexWrap: "wrap" }}
                      >
                        {brandForm.brandColors.map((hex, i) => (
                          <Stack
                            key={`${hex}-${i}`}
                            direction="row"
                            spacing={1}
                            sx={{
                              alignItems: "center",
                              border: `1px solid ${themePalette.divider}`,
                              borderRadius: "6px",
                              px: 1.25,
                              py: 0.5,
                              bgcolor: themePalette.background.default,
                            }}
                          >
                            <Box
                              sx={{
                                width: 14,
                                height: 14,
                                borderRadius: "3px",
                                bgcolor: hex,
                                border: `1px solid ${themePalette.divider}`,
                              }}
                            />
                            <Typography
                              sx={{
                                fontFamily: FONT_MONO,
                                fontSize: "0.75rem",
                              }}
                            >
                              {hex}
                            </Typography>
                            {!isPortalLocked && (
                              <Button
                                size="small"
                                aria-label={`Remove color ${hex}`}
                                sx={{
                                  minWidth: 0,
                                  minHeight: 0,
                                  px: 0.5,
                                  py: 0,
                                  fontSize: "0.75rem",
                                }}
                                onClick={() =>
                                  setBrandForm({
                                    ...brandForm,
                                    brandColors: brandForm.brandColors.filter(
                                      (_, idx) => idx !== i,
                                    ),
                                  })
                                }
                              >
                                ×
                              </Button>
                            )}
                          </Stack>
                        ))}
                      </Stack>
                      {!isPortalLocked && (
                        <Stack
                          direction="row"
                          spacing={1.5}
                          useFlexGap
                          sx={{ alignItems: "center", flexWrap: "wrap" }}
                        >
                          <input
                            type="color"
                            value={
                              /^#[0-9a-fA-F]{6}$/.test(colorInput.trim())
                                ? colorInput.trim()
                                : "#EDA320"
                            }
                            onChange={(e) =>
                              setColorInput(e.target.value.toUpperCase())
                            }
                            style={{
                              width: 38,
                              height: 36,
                              border: `1px solid ${themePalette.divider}`,
                              borderRadius: 6,
                              cursor: "pointer",
                            }}
                          />
                          <TextField
                            value={colorInput}
                            onChange={(e) => setColorInput(e.target.value)}
                            size="small"
                            placeholder="#EDA320"
                            sx={{ width: 140 }}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              const trimmed = colorInput.trim();
                              const normalized = trimmed.startsWith("#")
                                ? trimmed
                                : `#${trimmed}`;
                              if (!/^#[0-9a-fA-F]{3,8}$/.test(normalized)) {
                                dispatch(
                                  showToast({
                                    severity: "warning",
                                    text: "Enter a valid hex color code (e.g. #EDA320).",
                                  }),
                                );
                                return;
                              }
                              const canonical = normalized.toUpperCase();
                              if (brandForm.brandColors.length >= 12) {
                                dispatch(
                                  showToast({
                                    severity: "warning",
                                    text: "Maximum of 12 brand colors allowed.",
                                  }),
                                );
                                return;
                              }
                              if (!brandForm.brandColors.includes(canonical)) {
                                setBrandForm({
                                  ...brandForm,
                                  brandColors: [
                                    ...brandForm.brandColors,
                                    canonical,
                                  ],
                                });
                              }
                              setColorInput(canonical);
                            }}
                          >
                            Add Color
                          </Button>
                        </Stack>
                      )}
                    </Box>

                    <TextField
                      label="Typography Guidelines"
                      required
                      multiline
                      rows={2}
                      fullWidth
                      value={brandForm.typographyNotes}
                      onChange={(e) =>
                        setBrandForm({
                          ...brandForm,
                          typographyNotes: e.target.value,
                        })
                      }
                      placeholder="Specify primary display font, body font, and licensing notes"
                    />
                    <TextField
                      label="Design References & Moodboards"
                      multiline
                      rows={2}
                      fullWidth
                      value={brandForm.designReferences}
                      onChange={(e) =>
                        setBrandForm({
                          ...brandForm,
                          designReferences: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="Brand Voice & Tone Notes"
                      multiline
                      rows={2}
                      fullWidth
                      value={brandForm.brandVoiceNotes}
                      onChange={(e) =>
                        setBrandForm({
                          ...brandForm,
                          brandVoiceNotes: e.target.value,
                        })
                      }
                    />
                  </Stack>
                )}

                {/* SECTION 3: WEBSITE CONTENT */}
                {activeSectionKey === "website_content" && (
                  <Stack spacing={2.5}>
                    <TextField
                      label="Homepage Headline & Key Messaging"
                      required
                      multiline
                      rows={3}
                      fullWidth
                      value={contentForm.homepageCopy}
                      onChange={(e) =>
                        setContentForm({
                          ...contentForm,
                          homepageCopy: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="About Us / Company Story"
                      required
                      multiline
                      rows={3}
                      fullWidth
                      value={contentForm.aboutCopy}
                      onChange={(e) =>
                        setContentForm({
                          ...contentForm,
                          aboutCopy: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="Products / Services Overview"
                      required
                      multiline
                      rows={3}
                      fullWidth
                      value={contentForm.servicesCopy}
                      onChange={(e) =>
                        setContentForm({
                          ...contentForm,
                          servicesCopy: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="Contact Page Details & Hours"
                      multiline
                      rows={2}
                      fullWidth
                      value={contentForm.contactPageCopy}
                      onChange={(e) =>
                        setContentForm({
                          ...contentForm,
                          contactPageCopy: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="Existing Website Links to Preserve or Migrate"
                      fullWidth
                      value={contentForm.existingWebsiteRefs}
                      onChange={(e) =>
                        setContentForm({
                          ...contentForm,
                          existingWebsiteRefs: e.target.value,
                        })
                      }
                    />
                    <Divider />
                    <FileUploader
                      clientId={workspace.client.id}
                      category="website_media"
                      disabled={isPortalLocked}
                      label={`Upload Website Photos, Hero Images, or Videos${websiteAssets.length > 0 ? ` (${websiteAssets.length} uploaded)` : ""}`}
                      onUploaded={() => {
                        refetch();
                        dispatch(
                          showToast({
                            severity: "success",
                            text: "Website media uploaded",
                          }),
                        );
                      }}
                      onError={(msg) =>
                        dispatch(showToast({ severity: "error", text: msg }))
                      }
                    />
                    <SectionAssetsList
                      assets={websiteAssets}
                      clientId={workspace.client.id}
                      readOnly={isPortalLocked}
                    />
                  </Stack>
                )}

                {/* SECTION 4: PROJECT REQUIREMENTS */}
                {activeSectionKey === "project_requirements" && (
                  <Stack spacing={2.5}>
                    <TextField
                      label="Primary Project Goals"
                      required
                      multiline
                      rows={3}
                      fullWidth
                      value={reqForm.projectGoals}
                      onChange={(e) =>
                        setReqForm({ ...reqForm, projectGoals: e.target.value })
                      }
                    />
                    <TextField
                      label="Required Features & Deliverables"
                      required
                      multiline
                      rows={3}
                      fullWidth
                      value={reqForm.requiredFeatures}
                      onChange={(e) =>
                        setReqForm({
                          ...reqForm,
                          requiredFeatures: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="Functional & Integration Requirements"
                      multiline
                      rows={2}
                      fullWidth
                      value={reqForm.functionalRequirements}
                      onChange={(e) =>
                        setReqForm({
                          ...reqForm,
                          functionalRequirements: e.target.value,
                        })
                      }
                    />
                    <TextField
                      label="Design Preferences"
                      multiline
                      rows={2}
                      fullWidth
                      value={reqForm.designPreferences}
                      onChange={(e) =>
                        setReqForm({
                          ...reqForm,
                          designPreferences: e.target.value,
                        })
                      }
                    />
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 7 }}>
                        <TextField
                          label="Reference Websites"
                          fullWidth
                          value={reqForm.referenceWebsites}
                          onChange={(e) =>
                            setReqForm({
                              ...reqForm,
                              referenceWebsites: e.target.value,
                            })
                          }
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                          label="Target Launch Deadline"
                          type="date"
                          required
                          fullWidth
                          slotProps={{ inputLabel: { shrink: true } }}
                          value={reqForm.targetDeadline}
                          onChange={(e) =>
                            setReqForm({
                              ...reqForm,
                              targetDeadline: e.target.value,
                            })
                          }
                        />
                      </Grid>
                    </Grid>
                    <TextField
                      label="Additional Instructions"
                      multiline
                      rows={2}
                      fullWidth
                      value={reqForm.additionalInstructions}
                      onChange={(e) =>
                        setReqForm({
                          ...reqForm,
                          additionalInstructions: e.target.value,
                        })
                      }
                    />
                  </Stack>
                )}

                {/* SECTION 5: ACCESS & CREDENTIALS */}
                {activeSectionKey === "access_credentials" && (
                  <Stack spacing={3}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                          select
                          label="Preferred Access Mechanism"
                          fullWidth
                          value={accessMetaForm.accessMethodPreference}
                          onChange={(e) =>
                            setAccessMetaForm({
                              ...accessMetaForm,
                              accessMethodPreference: e.target.value,
                            })
                          }
                        >
                          <MenuItem value="delegated_invite">
                            Delegated Collaborator Invite
                          </MenuItem>
                          <MenuItem value="temporary_token">
                            Temporary / Scoped Token
                          </MenuItem>
                          <MenuItem value="encrypted_vault">
                            Encrypted Credential Vault
                          </MenuItem>
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 7 }}>
                        <TextField
                          label="Delegated Access Notes"
                          fullWidth
                          value={accessMetaForm.delegatedAccessNotes}
                          onChange={(e) =>
                            setAccessMetaForm({
                              ...accessMetaForm,
                              delegatedAccessNotes: e.target.value,
                            })
                          }
                          placeholder="e.g. Sent Cloudflare & Shopify collaborator invites"
                        />
                      </Grid>
                    </Grid>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={accessMetaForm.confirmedSecurityReview}
                          onChange={(e) =>
                            setAccessMetaForm({
                              ...accessMetaForm,
                              confirmedSecurityReview: e.target.checked,
                            })
                          }
                        />
                      }
                      label="I confirm that temporary or delegated access is used wherever supported."
                    />

                    <Divider />

                    <CredentialVaultPanel
                      clientId={workspace.client.id}
                      credentials={workspace.credentials}
                      viewerRole={viewerRole}
                      readOnly={isPortalLocked}
                    />
                  </Stack>
                )}

                {/* SECTION 6: ADDITIONAL DOCUMENTS */}
                {activeSectionKey === "additional_documents" && (
                  <Stack spacing={2.5}>
                    <FileUploader
                      clientId={workspace.client.id}
                      category="additional_document"
                      disabled={isPortalLocked}
                      label={`Upload Contracts, Sitemaps, PDFs, or Word Documents${additionalDocAssets.length > 0 ? ` (${additionalDocAssets.length} uploaded)` : ""}`}
                      onUploaded={() => {
                        refetch();
                        dispatch(
                          showToast({
                            severity: "success",
                            text: "Document uploaded",
                          }),
                        );
                      }}
                      onError={(msg) =>
                        dispatch(showToast({ severity: "error", text: msg }))
                      }
                    />

                    <SectionAssetsList
                      assets={additionalDocAssets}
                      clientId={workspace.client.id}
                      readOnly={isPortalLocked}
                    />

                    <TextField
                      label="Document Notes"
                      multiline
                      rows={2}
                      fullWidth
                      value={docsMetaForm.documentNotes}
                      onChange={(e) =>
                        setDocsMetaForm({
                          ...docsMetaForm,
                          documentNotes: e.target.value,
                        })
                      }
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={docsMetaForm.noAdditionalDocsNeeded}
                          onChange={(e) =>
                            setDocsMetaForm({
                              ...docsMetaForm,
                              noAdditionalDocsNeeded: e.target.checked,
                            })
                          }
                        />
                      }
                      label="No additional documents are needed for this project."
                    />
                  </Stack>
                )}

                {/* Section Action Footer */}
                <Divider sx={{ my: 3 }} />
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  sx={{
                    justifyContent: "space-between",
                    alignItems: { xs: "stretch", sm: "center" },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    {prevSection && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ArrowLeft size={14} />}
                        onClick={() => setActiveSectionKey(prevSection.key)}
                      >
                        Previous
                      </Button>
                    )}
                    {nextSection && (
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ArrowRight size={14} />}
                        onClick={() => setActiveSectionKey(nextSection.key)}
                      >
                        Next
                      </Button>
                    )}
                    <Typography
                      variant="caption"
                      sx={{ display: { xs: "none", lg: "inline" }, ml: 1 }}
                    >
                      {activeSection.updatedAt
                        ? `Updated ${formatShortDate(activeSection.updatedAt)}`
                        : "Not saved yet"}
                    </Typography>
                  </Stack>

                  <Stack
                    direction="row"
                    spacing={1.5}
                    useFlexGap
                    sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}
                  >
                    {!isPortalLocked && (
                      <>
                        <Button
                          variant="outlined"
                          disabled={saving}
                          startIcon={<Save size={15} />}
                          onClick={() => handleSave(false)}
                        >
                          Save Draft
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          disabled={saving}
                          startIcon={<Send size={15} />}
                          onClick={() => handleSave(true)}
                        >
                          {saving
                            ? "Submitting..."
                            : activeSection.status === "completed"
                              ? "Update Submission"
                              : "Submit Section"}
                        </Button>
                      </>
                    )}
                  </Stack>
                </Stack>

                {/* Agency Staff Review Controls (Never visible in Client Portal) */}
                {!isClientPortal && (
                  <Box
                    sx={{
                      mt: 3,
                      p: 2.5,
                      borderRadius: "8px",
                      bgcolor: themePalette.background.default,
                      border: `1px solid ${themePalette.divider}`,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: themePalette.text.primary, mb: 1 }}
                    >
                      Agency Review & Sign-Off
                    </Typography>
                    <Stack
                      direction={"column"}
                      spacing={1.5}
                      sx={{ alignItems: "stretch" }}
                    >
                      <TextField
                        placeholder="Optional review note or requested changes..."
                        fullWidth
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                      />
                      <Button
                        variant="outlined"
                        color="warning"
                        disabled={reviewing}
                        startIcon={<RotateCcw size={15} />}
                        onClick={() => handleReview("needs_revision")}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        Request Changes
                      </Button>
                      <Button
                        variant="contained"
                        color="secondary"
                        disabled={reviewing}
                        startIcon={<CheckCircle2 size={15} />}
                        onClick={() => handleReview("completed")}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        Approve Section
                      </Button>
                    </Stack>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {!isClientPortal && fullClientRecord && (
        <>
          <InviteClientDialog
            client={inviteOpen ? fullClientRecord : null}
            onClose={() => setInviteOpen(false)}
          />
          <ClientFormDialog
            open={editOpen}
            client={fullClientRecord}
            onClose={() => setEditOpen(false)}
          />
        </>
      )}
    </>
  );

  return isClientPortal ? content : <PageContainer>{content}</PageContainer>;
}
