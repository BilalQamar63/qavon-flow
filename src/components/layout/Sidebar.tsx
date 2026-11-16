import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  Activity,
  Briefcase,
  FolderOpen,
  Layers,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { QAVONFLOW_BRANDING } from "../../constants/branding";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  setActivePage,
  setMobileNavOpen,
  type AgencyNavPage,
} from "../../store/slices/uiSlice";
import { FONT_DISPLAY, themePalette, themeSpacing } from "../../theme";
import { BrandLogo } from "../common/BrandLogo";

interface SidebarProps {
  agencyName: string;
}

const NAV_ITEMS: { id: AgencyNavPage; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={18} /> },
  { id: "clients", label: "Clients", icon: <Briefcase size={18} /> },
  { id: "onboarding", label: "Onboarding", icon: <Layers size={18} /> },
  { id: "assets", label: "Assets", icon: <FolderOpen size={18} /> },
  { id: "team", label: "Team", icon: <Users size={18} /> },
  { id: "activity", label: "Activity", icon: <Activity size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings size={18} /> },
];

export function Sidebar({ agencyName }: SidebarProps) {
  const dispatch = useAppDispatch();
  const activePage = useAppSelector((s) => s.ui.activePage);
  const mobileOpen = useAppSelector((s) => s.ui.mobileNavOpen);

  const content = (
    <Box
      sx={{
        width: themeSpacing.sidebarWidth,
        height: "100%",
        bgcolor: themePalette.background.darkSurface,
        color: themePalette.text.onDark,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          height: themeSpacing.topbarHeight,
          px: 2.5,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <BrandLogo surface="dark" size="sm" showByline />
      </Box>

      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const selected = activePage === item.id;
          return (
            <ListItemButton
              key={item.id}
              selected={selected}
              onClick={() => dispatch(setActivePage(item.id))}
              sx={{
                borderRadius: "8px",
                mb: 0.5,
                py: 1,
                px: 1.5,
                color: selected
                  ? themePalette.primary.main
                  : themePalette.text.onDarkMuted,
                bgcolor: selected ? themePalette.accent.main : "transparent",
                "&.Mui-selected": {
                  bgcolor: themePalette.accent.main,
                  color: themePalette.primary.main,
                },
                "&.Mui-selected:hover": {
                  bgcolor: themePalette.accent.hover,
                },
                "&:hover": {
                  bgcolor: selected
                    ? themePalette.accent.hover
                    : "rgba(255, 255, 255, 0.06)",
                  color: selected
                    ? themePalette.primary.main
                    : themePalette.text.onDark,
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 34,
                  color: "inherit",
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: {
                    sx: {
                      fontFamily: FONT_DISPLAY,
                      fontSize: "0.875rem",
                      fontWeight: selected ? 700 : 500,
                      whiteSpace: "nowrap",
                      color: "white",
                    },
                  },
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: themePalette.text.onDark,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {agencyName}
        </Typography>
        <Typography
          sx={{
            fontSize: "0.7rem",
            color: themePalette.text.onDarkMuted,
            lineHeight: 1.4,
            mt: 0.25,
          }}
        >
          {QAVONFLOW_BRANDING.signature}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
      <Box
        component="aside"
        sx={{
          width: { md: themeSpacing.sidebarWidth },
          flexShrink: { md: 0 },
          display: { xs: "none", md: "block" },
        }}
      >
        <Box sx={{ position: "fixed", top: 0, left: 0, bottom: 0 }}>
          {content}
        </Box>
      </Box>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => dispatch(setMobileNavOpen(false))}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: "block", md: "none" } }}
      >
        {content}
      </Drawer>
    </>
  );
}
