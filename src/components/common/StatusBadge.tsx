import { Box, Typography } from '@mui/material';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  Mail,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  CLIENT_STATUS_LABELS,
  INVITATION_STATUS_LABELS,
  SECTION_STATUS_LABELS,
} from '../../constants/onboarding';
import { themePalette } from '../../theme';
import type {
  ClientOnboardingStatus,
  InvitationStatus,
  SectionCompletionStatus,
} from '../../types';

type AnyStatus = ClientOnboardingStatus | SectionCompletionStatus | InvitationStatus;

interface StatusBadgeProps {
  status: AnyStatus;
  kind: 'client' | 'section' | 'invitation';
}

export function StatusBadge({ status, kind }: StatusBadgeProps) {
  let label = String(status);
  if (kind === 'client') label = CLIENT_STATUS_LABELS[status as ClientOnboardingStatus] || status;
  if (kind === 'section') label = SECTION_STATUS_LABELS[status as SectionCompletionStatus] || status;
  if (kind === 'invitation') label = INVITATION_STATUS_LABELS[status as InvitationStatus] || status;

  const isSuccess = status === 'completed' || status === 'accepted';
  const isWarning = status === 'in_progress' || status === 'sent' || status === 'needs_revision';
  const isInfo = status === 'in_review';
  const isError = status === 'overdue' || status === 'expired' || status === 'revoked';

  const color = isSuccess
    ? themePalette.status.success
    : isError
      ? themePalette.status.error
      : isInfo
        ? themePalette.status.info
        : isWarning
          ? themePalette.status.warning
          : themePalette.text.secondary;

  const bgColor = isSuccess
    ? themePalette.status.successSoft
    : isError
      ? themePalette.status.errorSoft
      : isInfo
        ? themePalette.status.infoSoft
        : isWarning
          ? themePalette.status.warningSoft
          : themePalette.status.neutralSoft;

  const Icon = isSuccess
    ? CheckCircle2
    : status === 'needs_revision'
      ? RotateCcw
      : isError
        ? status === 'revoked'
          ? XCircle
          : AlertCircle
        : status === 'in_review'
          ? Eye
          : status === 'sent'
            ? Mail
            : status === 'archived'
              ? Archive
              : Clock;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.625,
        px: 1,
        py: 0.375,
        borderRadius: '5px',
        bgcolor: bgColor,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={13} strokeWidth={2.2} />
      <Typography
        component="span"
        sx={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
