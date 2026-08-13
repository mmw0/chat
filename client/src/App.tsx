import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimeAvatarPickerGuard } from "@/components/AnimeAvatarPickerGuard";
import { PrivateChatCopyGuard } from "@/components/PrivateChatCopyGuard";
import { ConversationOrganizerDock } from "@/components/ConversationOrganizerDock";
import { E2eeDeviceGuard } from "@/components/E2eeDeviceGuard";
import { SettingsSecurityInfoGuard } from "@/components/SettingsSecurityInfoGuard";
import { SettingsHub } from "@/components/SettingsHub";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/connect/:token" component={Home} />
      <Route path="/pair/:token" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <Router />
          <ConversationOrganizerDock />
          <SettingsHub />
          <E2eeDeviceGuard />
          <SettingsSecurityInfoGuard />
          <PrivateChatCopyGuard />
          <AnimeAvatarPickerGuard />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
